import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// Sub-schema for MIV Items
@Schema({ _id: true, strict: false })
export class MIVItem {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem' }) itemId?: Types.ObjectId;
  @Prop({ type: String, required: true }) itemCode!: string;
  @Prop({ type: String, required: true }) itemName!: string;
  @Prop({ type: String, default: 'EA' }) uom?: string;
  @Prop({ type: Number, required: true, default: 1 }) quantity!: number;
  @Prop({ type: Number }) quantityRequested?: number;
  @Prop({ type: Number }) quantityIssued?: number;
  @Prop({ type: Number, default: 0 }) unitPrice?: number;
  @Prop({ type: Number, default: 0 }) unitCost?: number;
  @Prop({ type: Number, default: 0 }) totalPrice?: number;
  @Prop({ type: Number, default: 0 }) totalCost?: number;
  @Prop({ type: String }) location?: string;
  @Prop({ type: String }) batchNumber?: string;
  @Prop({ type: String }) notes?: string;
}
export const MIVItemSchema = SchemaFactory.createForClass(MIVItem);

@Schema({ timestamps: true, strict: false })
export class MIV {
  @Prop({ type: String, unique: true, sparse: true, index: true }) mivNumber?: string;
  @Prop({ type: String, index: true }) voucherNumber?: string;
  @Prop({ type: String, index: true }) documentNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'Warehouse' })
  warehouseId?: Types.ObjectId;
  @Prop({ type: String }) warehouseName?: string;

  @Prop({
    type: String,
    enum: [
      'Draft',
      'Pending Approval',
      'Approved',
      'Issued',
      'Posted',
      'Rejected',
      'Cancelled',
    ],
    default: 'Draft',
    index: true,
  })
  status!: string;

  @Prop({ type: String }) chargeType?: string; // 'Project' | 'Cost Center' | 'Asset' | 'Department' | 'General'

  // Project linkage
  @Prop({ type: Types.ObjectId, ref: 'Project' }) projectId?: Types.ObjectId;
  @Prop({ type: String }) projectCode?: string;
  @Prop({ type: String }) projectName?: string;

  // Cost Center linkage
  @Prop({ type: String }) costCenter?: string;
  @Prop({ type: String }) costCenterCode?: string;
  @Prop({ type: String }) costCenterName?: string;

  // Asset linkage
  @Prop({ type: Types.ObjectId, ref: 'Equipment' }) assetId?: Types.ObjectId;
  @Prop({ type: String }) assetCode?: string;
  @Prop({ type: String }) assetName?: string;

  // Department linkage
  @Prop({ type: Types.ObjectId, ref: 'Department' }) departmentId?: Types.ObjectId;
  @Prop({ type: String }) departmentName?: string;

  // People & Dates
  @Prop({ type: Types.ObjectId, ref: 'User' }) requestedBy?: Types.ObjectId;
  @Prop({ type: String }) requesterName?: string;
  @Prop({ type: Date, default: Date.now }) requestDate?: Date;
  @Prop({ type: Date, default: Date.now }) issueDate?: Date;

  @Prop({ type: String }) approvedBy?: string;
  @Prop({ type: Date }) approvedAt?: Date;

  @Prop({ type: String }) issuedBy?: string;
  @Prop({ type: Date }) issuedAt?: Date;

  @Prop({ type: String }) postedBy?: string;
  @Prop({ type: Date }) postedAt?: Date;

  @Prop({ type: String }) createdBy?: string;

  @Prop({ type: Number, default: 0 }) totalAmount?: number;

  @Prop({ type: [MIVItemSchema], default: [] })
  items!: MIVItem[];

  @Prop({ type: String }) remarks?: string;
  @Prop({ type: String }) purpose?: string;
  @Prop({ type: String }) recipientName?: string;

  @Prop({ type: Boolean, default: false, index: true }) isDeleted!: boolean;
}

export const MIVSchema = SchemaFactory.createForClass(MIV);
MIVSchema.index({ status: 1, createdAt: 1, 'items.itemId': 1 });
export type MIVDocument = HydratedDocument<MIV>;
export const MIVModelName = MIV.name;
export const MIVModel = MongooseModule.forFeature([
  { name: MIVModelName, schema: MIVSchema },
]);
