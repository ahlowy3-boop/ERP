import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true, strict: false })
export class ItemLedger {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem' })
  itemId?: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  itemCode!: string; // نضع Index هنا لأننا سنبحث كثيراً بهذا الحقل

  @Prop({ type: String })
  itemName?: string;

  @Prop({ type: Types.ObjectId, ref: 'Warehouse' })
  warehouseId?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  date!: Date;

  @Prop({ type: Date, default: Date.now })
  transactionDate?: Date;

  @Prop({
    type: String,
    required: true,
    enum: ['MRV', 'MIV', 'TRN', 'ADJ', 'INI', 'PURCHASE_RECEIPT'],
  })
  type!: string; // نوع الحركة

  @Prop({ type: String })
  transactionType?: string; // e.g. 'PURCHASE_RECEIPT'

  @Prop({ type: String })
  documentType?: string; // e.g. 'MRV'

  @Prop({ type: Types.ObjectId })
  documentId?: Types.ObjectId;

  @Prop({ type: String })
  documentNumber?: string;

  @Prop({ type: String, required: true })
  reference!: string; // المستند المرجعي (مثال: MRV-2026-001)

  @Prop({ type: Number, required: true, default: 0 })
  qtyIn!: number; // الكمية الواردة

  @Prop({ type: Number, default: 0 })
  quantityIn?: number;

  @Prop({ type: Number, required: true, default: 0 })
  qtyOut!: number; // الكمية المنصرفة

  @Prop({ type: Number, default: 0 })
  quantityOut?: number;

  @Prop({ type: Number, required: true })
  balance!: number; // الرصيد التراكمي بعد هذه الحركة

  @Prop({ type: Number })
  runningBalance?: number;

  @Prop({ type: Number, required: true, default: 0 })
  unitPrice!: number; // سعر الوحدة وقت الحركة

  @Prop({ type: Number, default: 0 })
  unitCost?: number;

  @Prop({ type: Number, default: 0 })
  totalCost?: number;

  @Prop({ type: String })
  referencePoNumber?: string;

  @Prop({ type: String })
  createdBy?: string;
}

export const ItemLedgerSchema = SchemaFactory.createForClass(ItemLedger);
export const ItemLedgerModelName = ItemLedger.name;
export const ItemLedgerModel = MongooseModule.forFeature([
  { name: ItemLedgerModelName, schema: ItemLedgerSchema },
]);
export type ItemLedgerDocument = HydratedDocument<ItemLedger>;
