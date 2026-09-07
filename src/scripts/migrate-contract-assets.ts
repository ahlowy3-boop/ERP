/**
 * Migration: Backfill Contract.assets[] from Contract.rigId / Contract.rigName
 *
 * Run once after deploying the multi-asset schema change.
 * Targets contracts that have a rigId but no assets array (or an empty one).
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrate-contract-assets.ts
 *
 * ⚠️  Always take a MongoDB backup before running on production.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

// ── Minimal inline schema (no decorators needed for migration scripts) ─────────
const ContractAssetSchema = new mongoose.Schema(
  {
    assetId:       { type: String, required: true },
    assetNumber:   { type: String, default: '' },
    equipmentName: { type: String, required: true },
    category:      { type: String, required: true },
    location:      { type: String, default: '' },
  },
  { _id: false },
);

const ContractSchema = new mongoose.Schema(
  {
    rigId:   { type: mongoose.Schema.Types.Mixed, default: null },
    rigName: { type: String, default: null },
    assets:  { type: [ContractAssetSchema], default: [] },
  },
  { strict: false, collection: 'contracts' },
);

const Contract = mongoose.model('ContractMigration', ContractSchema);

async function migrate() {
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error('❌ MONGO_URI or DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.\n');

  // Find contracts that have a rigId but empty/missing assets array
  const contracts = await Contract.find({
    rigId: { $exists: true, $nin: [null, ''] },
    $or: [
      { assets: { $exists: false } },
      { assets: { $size: 0 } },
    ],
  }).lean();

  console.log(`📋 Found ${contracts.length} contracts to migrate.`);

  if (contracts.length === 0) {
    console.log('✅ Nothing to migrate. All contracts already have assets[].');
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  let failed   = 0;

  for (const c of contracts) {
    try {
      const assetId = c.rigId?.toString() || '';
      const name    = (c as any).rigName || assetId;

      await Contract.updateOne(
        { _id: c._id },
        {
          $set: {
            assets: [
              {
                assetId,
                assetNumber:   '',
                equipmentName: name,
                category:      'Rig',
                location:      '',
              },
            ],
          },
        },
      );

      migrated++;
      if (migrated % 50 === 0) {
        console.log(`  ↳ Migrated ${migrated}/${contracts.length}...`);
      }
    } catch (err: any) {
      failed++;
      console.error(`  ❌ Failed for contract ${(c as any).contractNumber}: ${err.message}`);
    }
  }

  console.log(`\n✅ Migration complete: ${migrated} migrated, ${failed} failed.`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected.');
}

migrate().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
