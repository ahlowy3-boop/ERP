import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: false })
export class VendorTimeline {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendorId!: Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() }) date!: Date;

  @Prop({
    type: String,
    enum: [
      'Created', 'RFQ Sent', 'RFQ Email Sent', 'Quotation Received',
      'Quotation Submitted', 'PO Issued', 'PO Sent', 'Goods Received',
      'Invoice Submitted', 'Payment Released', 'Evaluation Completed',
      'Status Changed', 'Document Uploaded', 'Clarification',
      'Negotiation', 'Delivery Update', 'Custom',
    ],
    default: 'Custom',
  })
  eventType!: string;

  @Prop({ type: String, required: true }) title!: string;
  @Prop({ type: String }) description?: string;
  @Prop({ type: String }) referenceNumber?: string;
  @Prop({ type: Number }) amount?: number;

  @Prop({ type: Types.ObjectId, ref: 'User' }) performedBy?: Types.ObjectId;
  @Prop({ type: String }) performedByName?: string;
}

export const VendorTimelineSchema = SchemaFactory.createForClass(VendorTimeline);
export const VendorTimelineModelName = 'VendorTimeline';
export type VendorTimelineDoc = HydratedDocument<VendorTimeline>;

export const VendorTimelineMongooseModel = MongooseModule.forFeature([
  { name: VendorTimelineModelName, schema: VendorTimelineSchema },
]);
