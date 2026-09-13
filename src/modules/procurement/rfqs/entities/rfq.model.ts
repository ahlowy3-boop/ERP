import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class RFQ {
  // Identification & Chain
  @Prop({ type: String, required: true, unique: true, index: true })
  rfqNumber!: string; // e.g. "RFQ-2026-0001-0001"

  @Prop({ type: String })
  documentNumber?: string;

  @Prop({ type: String })
  procurementChain?: string; // e.g. "0001-0001"

  @Prop({ type: String })
  rootProcurementNumber?: string; // PR Number (e.g. "PR-2026-0001")

  @Prop({ type: String })
  chainId?: string;

  // Link to source PR
  @Prop({ type: Types.ObjectId, ref: 'PurchaseRequest', required: true, index: true })
  purchaseRequestId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  purchaseRequestNumber!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: Date, default: () => new Date() })
  createdDate!: Date;

  @Prop({ type: Date, required: true })
  deadlineDate!: Date;

  @Prop({ type: Date })
  requiredDeliveryDate?: Date;

  @Prop({ type: String })
  requester?: string;

  // RFQ Workflow Status
  @Prop({
    type: String,
    enum: [
      'Draft',
      'Sent',
      'Published',
      'Partially Responded',
      'Fully Responded',
      'Closed',
      'Awarded',
      'Cancelled',
    ],
    default: 'Sent',
  })
  status!: string;

  // Invited Vendors List
  @Prop({ type: Array, default: [] })
  vendors!: any[];

  // Quotations / Bids Received
  @Prop({ type: Array, default: [] })
  quotations!: any[];

  // Line Items (inherited from PR)
  @Prop({ type: Array, required: true, default: [] })
  items!: any[];

  // Award Information
  @Prop({ type: Types.ObjectId, ref: 'Vendor' })
  awardedVendorId?: Types.ObjectId;

  @Prop({ type: String })
  awardedVendorName?: string;

  @Prop({ type: Types.ObjectId })
  awardedQuotationId?: Types.ObjectId;

  @Prop({ type: String })
  awardedQuotationNumber?: string;

  @Prop({ type: Date })
  awardedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder' })
  generatedPurchaseOrderId?: Types.ObjectId;

  @Prop({ type: String })
  generatedPurchaseOrderNumber?: string;

  // Cost Allocation Dimensions
  @Prop({ type: String }) chargeType?: string;
  @Prop({ type: String }) projectId?: string;
  @Prop({ type: String }) projectName?: string;
  @Prop({ type: String }) assetId?: string;
  @Prop({ type: String }) assetName?: string;
  @Prop({ type: String }) costCenter?: string;

  // Audit
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isDeleted!: boolean;
}

export const RFQSchema = SchemaFactory.createForClass(RFQ);
export type RFQDocument = HydratedDocument<RFQ>;
export const RFQModelName = RFQ.name;
export const RfqModel = MongooseModule.forFeature([
  { name: RFQModelName, schema: RFQSchema },
]);
export const RfqModelName = RFQModelName;
export type RfqDocument = RFQDocument;
