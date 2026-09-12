import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class OpeningStock {
  // ── Auto-number ──────────────────────────────────────────────────────────
  @Prop({ type: String, unique: true, sparse: true })
  openingNumber?: string; // OS-2026-0001

  // ── Item reference ───────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem', required: true, index: true })
  itemId!: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  itemCode!: string;

  @Prop({ type: String, required: true })
  itemName!: string;

  // ── Warehouse reference ──────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'Warehouse', required: true, index: true })
  warehouseId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  warehouseCode!: string;

  // ── Core stock fields ────────────────────────────────────────────────────
  @Prop({ type: Number, required: true, min: 0 })
  openingQuantity!: number;

  @Prop({ type: String, required: true })
  unitOfMeasure!: string;

  // ── Optional batch / location fields ────────────────────────────────────
  @Prop({ type: String, default: null }) location?: string;
  @Prop({ type: String, default: null }) batchNumber?: string;
  @Prop({ type: String, default: null }) serialNumber?: string;
  @Prop({ type: String, default: null }) condition?: string;
  @Prop({ type: String, default: null }) notes?: string;

  // ── Dates & Status ───────────────────────────────────────────────────────
  @Prop({ type: Date, required: true, default: () => new Date() })
  openingDate!: Date;

  @Prop({
    type: String,
    enum: ['Draft', 'Posted'],
    default: 'Draft',
  })
  status!: string;

  @Prop({ type: Date, default: null }) postedAt?: Date;

  // ── Audit ─────────────────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;
}

export const OpeningStockSchema = SchemaFactory.createForClass(OpeningStock);

// Composite unique index: one opening stock per item+warehouse+batch per date
OpeningStockSchema.index(
  { itemId: 1, warehouseId: 1, openingDate: 1, batchNumber: 1 },
  { unique: true, sparse: true },
);

export const OpeningStockModelName = OpeningStock.name;
export type OpeningStockDocument = HydratedDocument<OpeningStock>;

export const OpeningStockModel = MongooseModule.forFeature([
  { name: OpeningStockModelName, schema: OpeningStockSchema },
]);
