import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class POItem {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem' })
  itemId?: Types.ObjectId;

  @Prop({ type: String })
  itemCode?: string;

  @Prop({ type: String })
  itemName?: string;

  @Prop({ type: String })
  arabicName?: string;

  @Prop({ type: String, default: 'EA' })
  uom?: string;

  @Prop({ type: Number, required: true, min: 1 })
  quantity!: number;

  @Prop({ type: Number, default: 0 })
  unitPrice?: number;

  @Prop({ type: Number, default: 0 })
  totalPrice?: number;

  @Prop({ type: String })
  category?: string;

  @Prop({ type: String })
  notes?: string;

  @Prop({ type: Number })
  sortOrder?: number;
}

@Schema({ timestamps: true, strict: false })
export class PurchaseOrder {
  @Prop({ type: String, required: true, unique: true }) poNumber!: string;
  @Prop({ type: String }) documentNumber?: string;
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true })
  vendorId!: Types.ObjectId;
  @Prop({ type: String }) vendorName?: string;
  @Prop({ type: String }) vendorContact?: string;
  @Prop({
    type: String,
    enum: [
      'Draft',
      'Pending Approval',
      'Approved',
      'Issued',
      'Partially Received',
      'Fully Received',
      'Completed',
      'Cancelled',
    ],
    default: 'Draft',
  })
  status!: string;
  @Prop({ type: [SchemaFactory.createForClass(POItem)], default: [] })
  items!: POItem[];
  @Prop({ type: Number, required: true }) totalValue!: number;
  @Prop({ type: Number }) totalAmount?: number;
  @Prop({ type: Number }) subtotal?: number;
  @Prop({ type: Number }) taxPercent?: number;
  @Prop({ type: Number }) taxAmount?: number;

  @Prop({ type: Types.ObjectId, ref: 'Rfq' }) rfqId?: Types.ObjectId;
  @Prop({ type: String }) rfqNumber?: string;
  @Prop({ type: String }) rootProcurementNumber?: string;
  @Prop({ type: String }) procurementChain?: string;
  @Prop({ type: String }) chainId?: string;
  @Prop({ type: Types.ObjectId }) parentDocumentId?: Types.ObjectId;
  @Prop({ type: String }) parentDocumentNumber?: string;
  @Prop({ type: String }) quotationNumber?: string;

  @Prop({ type: Date }) deliveryDate?: Date;
  @Prop({ type: String }) costCenter?: string;
  @Prop({ type: String }) paymentTerms?: string;
  @Prop({ type: String }) chargeType?: string;
  @Prop({ type: Types.ObjectId }) projectId?: Types.ObjectId;
  @Prop({ type: String }) projectName?: string;
  @Prop({ type: Types.ObjectId }) assetId?: Types.ObjectId;
  @Prop({ type: String }) assetName?: string;

  // مسار الاعتماد الذي كان مفقوداً في النسخ السابقة
  @Prop({ type: Array, default: [] }) approvalWorkflow!: any[];

  @Prop({ type: String }) contractFileUrl?: string;
  @Prop({ type: String }) contractNumber?: string;
  @Prop({ type: String }) contractTitle?: string;

  @Prop({ type: Boolean, default: false }) isDeleted!: boolean;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;
export const PurchaseOrderModelName = PurchaseOrder.name;
export const PurchaseOrderModel = MongooseModule.forFeature([
  { name: PurchaseOrderModelName, schema: PurchaseOrderSchema },
]);
