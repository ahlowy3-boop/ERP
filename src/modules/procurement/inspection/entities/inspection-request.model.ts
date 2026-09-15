import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// Sub-Schema for Inspection Items
@Schema({ _id: true, strict: false })
export class InspectionRequestItem {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem' }) itemId?: Types.ObjectId;
  @Prop({ type: String, required: true }) itemCode!: string;
  @Prop({ type: String, required: true }) itemName!: string;
  @Prop({ type: Number, required: true }) quantityOrdered!: number;
  @Prop({ type: Number, required: true, default: 0 }) quantityReceived!: number;
  @Prop({ type: Number, required: true, default: 0 }) quantityAccepted!: number;
  @Prop({ type: Number, required: true, default: 0 }) quantityRejected!: number;
  @Prop({ type: String }) uom?: string;
  @Prop({
    type: String,
    enum: ['Pending', 'Passed', 'Failed'],
    default: 'Pending',
  })
  status!: string;
  @Prop({ type: String }) remarks?: string;
}
const InspectionRequestItemSchema = SchemaFactory.createForClass(
  InspectionRequestItem,
);

// Main Inspection Request Schema
@Schema({ timestamps: true, strict: false })
export class InspectionRequest {
  @Prop({ type: String, unique: true, index: true }) requestNumber!: string; // IR-2026-0001 / INS-2026-001

  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder' }) poId?: Types.ObjectId;
  @Prop({ type: String }) poNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'Vendor' }) vendorId?: Types.ObjectId;
  @Prop({ type: String, required: true }) vendorName!: string;

  @Prop({ type: Date, default: Date.now }) requestDate!: Date;
  @Prop({ type: Date, default: Date.now }) requestedDate!: Date;
  @Prop({ type: String }) inspectorName?: string;
  @Prop({ type: Date }) inspectionDate?: Date;

  @Prop({
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'Conditional'],
    default: 'Pending',
  })
  status!: string;

  @Prop({ type: String }) notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Ncr' }) ncrId?: Types.ObjectId; // ربط بتقرير الرفض إن وُجد

  @Prop({ type: [InspectionRequestItemSchema], default: [] })
  items!: InspectionRequestItem[];
}

export const InspectionRequestSchema =
  SchemaFactory.createForClass(InspectionRequest);
export const InspectionRequestModelName = InspectionRequest.name;
export const InspectionRequestModel = MongooseModule.forFeature([
  { name: InspectionRequestModelName, schema: InspectionRequestSchema },
]);
export type InspectionRequestDocument = HydratedDocument<InspectionRequest>;
