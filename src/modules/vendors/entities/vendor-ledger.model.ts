import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: false })
export class VendorLedger {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendorId!: Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() }) date!: Date;

  @Prop({ type: String, required: true }) reference!: string; // PO-..., INV-..., PV-...

  @Prop({
    type: String,
    enum: [
      'Purchase Order', 'Supplier Invoice', 'Payment Voucher',
      'Credit Note', 'Debit Note', 'Advance Payment',
    ],
    required: true,
  })
  transactionType!: string;

  @Prop({ type: String }) description?: string;

  @Prop({ type: Number, default: 0 }) debit!: number;   // Amount owed to vendor (Invoice/PO)
  @Prop({ type: Number, default: 0 }) credit!: number;  // Amount paid to vendor (Payment)

  @Prop({ type: String, default: 'USD' }) currency!: string;
}

export const VendorLedgerSchema = SchemaFactory.createForClass(VendorLedger);
export const VendorLedgerModelName = 'VendorLedger';
export type VendorLedgerDoc = HydratedDocument<VendorLedger>;

export const VendorLedgerMongooseModel = MongooseModule.forFeature([
  { name: VendorLedgerModelName, schema: VendorLedgerSchema },
]);
