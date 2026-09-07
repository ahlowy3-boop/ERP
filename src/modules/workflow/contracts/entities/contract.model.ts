import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

export const ContractModelName = 'Contract';

// ── ContractAsset sub-document ────────────────────────────────────────────────
@Schema({ _id: false })
class ContractAsset {
  @Prop({ type: String, required: true })
  assetId!: string;          // _id from source collection

  @Prop({ type: String, default: '' })
  assetNumber!: string;      // equipment code / vehicle code

  @Prop({ type: String, required: true })
  equipmentName!: string;    // human-readable asset name

  @Prop({ type: String, required: true })
  category!: string;         // 'Rig' | 'Generator' | 'Vehicle' | 'Camp' | ...

  @Prop({ type: String, default: '' })
  location!: string;         // deployment location
}
const ContractAssetSchema = SchemaFactory.createForClass(ContractAsset);


@Schema({ timestamps: true, collection: 'contracts' })
export class Contract extends Document {
  @Prop({ required: true, unique: true, trim: true })
  contractNumber!: string; // CON-2026-001

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  clientName!: string;

  @Prop({ type: String, default: null })
  clientContact?: string;

  @Prop({ type: String, default: null })
  clientEmail?: string;

  @Prop({
    type: String,
    enum: ['Daily Rate', 'Lump Sum', 'Unit Rate', 'Time & Material'],
    default: 'Daily Rate',
  })
  type!: string;

  @Prop({
    type: String,
    enum: ['Draft', 'Active', 'Completed', 'Suspended', 'Terminated'],
    default: 'Draft',
  })
  status!: string;

  @Prop({ type: Date, required: true })
  startDate!: Date;

  @Prop({ type: Date, required: true })
  endDate!: Date;

  @Prop({ type: Number, required: true })
  value!: number;

  @Prop({ type: String, default: 'USD' })
  currency!: string;

  @Prop({ type: String, default: null })
  scope?: string;

  // Rig / Equipment (legacy — kept for backward compatibility)
  @Prop({ type: Types.ObjectId, ref: 'Equipment', default: null })
  rigId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  rigName?: string;

  // Multi-asset list (new field — preferred over rigId for new contracts)
  @Prop({ type: [ContractAssetSchema], default: [] })
  assets!: {
    assetId: string;
    assetNumber: string;
    equipmentName: string;
    category: string;
    location: string;
  }[];

  // Rate Sheet
  @Prop({
    type: [
      {
        id: String,
        description: String,
        unit: String,
        rate: Number,
        currency: String,
      },
    ],
    default: [],
  })
  rateSheet!: {
    id: string;
    description: string;
    unit: string;
    rate: number;
    currency: string;
  }[];

  // Milestones
  @Prop({
    type: [
      {
        id: String,
        title: String,
        dueDate: Date,
        completedDate: Date,
        amount: Number,
        status: String,
      },
    ],
    default: [],
  })
  milestones!: {
    id: string;
    title: string;
    dueDate: Date;
    completedDate?: Date;
    amount: number;
    status: string;
  }[];

  // Terms
  @Prop({ type: Number, default: 10 })
  retentionPercent!: number;

  @Prop({ type: Number, default: 15 })
  vatRate!: number;

  @Prop({ type: Number, default: 5 })
  withholdingRate!: number;

  @Prop({ type: String, default: 'Net 30' })
  paymentTerms!: string;

  // Project Manager
  @Prop({ type: String, default: null })
  projectManager?: string;

  // Location & Logistics
  @Prop({ type: String, default: null })
  country?: string;

  @Prop({ type: String, default: null })
  region?: string;

  @Prop({ type: String, default: null })
  siteName?: string;

  @Prop({ type: String, default: null })
  gpsCoordinates?: string;

  @Prop({ type: String, default: null })
  preferredWarehouse?: string;

  @Prop({ type: String, default: null })
  nearestWarehouse?: string;

  @Prop({ type: Number, default: null })
  distanceKm?: number;

  @Prop({ type: Number, default: null })
  estimatedTransportationCost?: number;

  // Auto-Generated References (filled when status → Active)
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  projectCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'CostCenter', default: null })
  costCenterId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  costCenterCode?: string;

  // Approval
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  approvedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);
// Note: contractNumber is unique via @Prop({ unique: true })
ContractSchema.index({ status: 1 });
ContractSchema.index({ clientName: 1 });

export const ContractModel = MongooseModule.forFeature([
  { name: ContractModelName, schema: ContractSchema },
]);
