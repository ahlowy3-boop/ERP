import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: true, strict: false })
export class MRVItem {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem' })
  itemId?: Types.ObjectId;

  @Prop({ type: String })
  itemCode?: string;

  @Prop({ type: String })
  itemName?: string;

  @Prop({ type: String })
  uom?: string;

  @Prop({ type: Number, default: 0 })
  quantityOrdered?: number;

  @Prop({ type: Number, default: 0 })
  quantityReceived?: number;

  @Prop({ type: Number, default: 0 })
  expectedQuantity?: number;

  @Prop({ type: Number, default: 0 })
  receivedQuantity?: number;

  @Prop({ type: Number, default: 0 })
  acceptedQuantity?: number;

  @Prop({ type: Number, default: 0 })
  rejectedQuantity?: number;

  @Prop({ type: Number, default: 0 })
  unitPrice?: number;

  @Prop({ type: Number, default: 0 })
  totalPrice?: number;

  @Prop({ type: String })
  location?: string;

  @Prop({ type: String })
  batchNumber?: string;

  @Prop({ type: Date })
  expiryDate?: Date;

  @Prop({ type: String })
  notes?: string;
}

export const MRVItemSchema = SchemaFactory.createForClass(MRVItem);

@Schema({ timestamps: true, strict: false })
export class MRV {
  @Prop({ type: String, required: true, unique: true, index: true })
  mrvNumber!: string;

  @Prop({ type: String, index: true })
  voucherNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder' })
  poId?: Types.ObjectId;

  @Prop({ type: String })
  poNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'InspectionRequest' })
  inspectionRequestId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Warehouse' })
  warehouseId?: Types.ObjectId;

  @Prop({ type: String })
  warehouseName?: string;

  @Prop({ type: Types.ObjectId, ref: 'Vendor' })
  vendorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Vendor' })
  supplierId?: Types.ObjectId;

  @Prop({ type: String })
  supplierName?: string;

  @Prop({ type: String })
  vendorName?: string;

  @Prop({ type: Date, default: Date.now })
  receivedDate!: Date;

  @Prop({ type: String })
  receivedBy?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  receivedById?: Types.ObjectId;

  @Prop({ type: String })
  postedBy?: string;

  @Prop({ type: Date })
  postedAt?: Date;

  @Prop({ type: String })
  approvedBy?: string;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: String })
  deliveryNoteNumber?: string; // رقم بوليصة الشحن من المورد

  @Prop({
    type: String,
    enum: [
      'Draft',
      'Pending Approval',
      'Approved',
      'Inspected',
      'Posted',
      'Cancelled',
    ],
    default: 'Draft',
  })
  status!: string;

  @Prop({ type: Number, default: 0 })
  totalAmount?: number;

  @Prop({ type: String })
  chargeType?: string; // 'OPEX' | 'CAPEX' | 'General Overhead'

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ type: String })
  projectName?: string;

  @Prop({ type: String })
  costCenter?: string;

  @Prop({ type: Types.ObjectId, ref: 'Equipment' })
  assetId?: Types.ObjectId;

  @Prop({ type: String })
  assetName?: string;

  @Prop({ type: [MRVItemSchema], required: true, default: [] })
  items!: MRVItem[];

  @Prop({ type: Boolean, default: false })
  isDeleted!: boolean;
}

export const MRVSchema = SchemaFactory.createForClass(MRV);
MRVSchema.index({ status: 1, createdAt: 1, 'items.itemId': 1 });
export const MRVModelName = MRV.name;
export type MRVDocument = HydratedDocument<MRV>;
export const MRVModel = MongooseModule.forFeature([
  { name: MRVModelName, schema: MRVSchema },
]);
export const MrvModel = MRVModel;
export const MrvModelName = MRVModelName;
export type MrvDocument = MRVDocument;
