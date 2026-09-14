import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum ItemStatus {
  InStock = 'In Stock',
  LowStock = 'Low Stock',
  OutOfStock = 'Out of Stock',
  Available = 'Available',
}

export enum ItemType {
  Material = 'Material',
  SparePart = 'Spare Part',
  Chemical = 'Chemical',
  Tool = 'Tool',
}

@Schema({ timestamps: true })
export class InventoryItem {
  @Prop({ type: String, required: true, unique: true, index: true })
  itemCode!: string;

  @Prop({ type: String, required: true })
  itemName!: string;

  @Prop({ type: String })
  category?: string;

  @Prop({ type: String })
  subCategory?: string;

  @Prop({ type: String, required: true })
  uom!: string;

  @Prop({ type: String, enum: ItemType, default: ItemType.Material })
  itemType!: ItemType;

  @Prop({ type: Number, required: true, default: 0 })
  quantity!: number; // الكمية الفعلية في المخزن

  @Prop({ type: Number, required: true, default: 0 })
  minQuantity!: number; // الحد الأدنى للتنبيه

  @Prop({ type: Number, default: 0 })
  reorderLevel?: number;

  @Prop({ type: Number, required: true, default: 0 })
  unitPrice!: number;

  @Prop({ type: String })
  location?: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: String })
  costCenter?: string;

  @Prop({ type: String, enum: ItemStatus, default: ItemStatus.InStock })
  status!: ItemStatus;
}

export const InventoryItemSchema = SchemaFactory.createForClass(InventoryItem);

// 🔥 أتمتة قاعدة العمل (Business Rule): تحديث حالة المخزون تلقائياً قبل الحفظ
InventoryItemSchema.pre('save', function () {
  if (this.quantity === 0) {
    this.status = ItemStatus.OutOfStock;
  } else if (this.quantity <= this.minQuantity) {
    this.status = ItemStatus.LowStock;
  } else {
    this.status = ItemStatus.InStock;
  }
});

export const InventoryItemModelName = InventoryItem.name;

export const InventoryItemModel = MongooseModule.forFeature([
  { name: InventoryItemModelName, schema: InventoryItemSchema },
]);

export type InventoryItemDocument = HydratedDocument<InventoryItem>;
