import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class VendorDocument {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendorId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: [
      'Contract', 'Quotation', 'Certification', 'Tax Document',
      'Bank Info', 'Commercial Registration', 'HSE Policy',
      'ISO Certificate', 'Other',
    ],
    required: true,
  })
  documentType!: string;

  @Prop({ type: String, required: true }) fileName!: string;
  @Prop({ type: String, required: true }) originalName!: string;
  @Prop({ type: String }) mimeType?: string;
  @Prop({ type: String }) fileSize?: string;
  @Prop({ type: String }) fileUrl?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' }) uploadedBy?: Types.ObjectId;
  @Prop({ type: Date, default: () => new Date() }) uploadedDate!: Date;
  @Prop({ type: Date }) expiryDate?: Date;

  @Prop({
    type: String,
    enum: ['Valid', 'Expiring Soon', 'Expired'],
    default: 'Valid',
  })
  status!: string;

  @Prop({ type: String }) notes?: string;
}

export const VendorDocumentSchema = SchemaFactory.createForClass(VendorDocument);
export const VendorDocumentModelName = 'VendorDocument';
export type VendorDocumentDoc = HydratedDocument<VendorDocument>;

export const VendorDocumentMongooseModel = MongooseModule.forFeature([
  { name: VendorDocumentModelName, schema: VendorDocumentSchema },
]);
