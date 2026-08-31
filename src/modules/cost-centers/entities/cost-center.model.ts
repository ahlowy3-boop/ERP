import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

export const CostCenterModelName = 'CostCenter';

@Schema({ timestamps: true, collection: 'cost_centers' })
export class CostCenter extends Document {
  @Prop({ required: true, unique: true, trim: true })
  code!: string; // e.g. CC-DRL-001

  @Prop({ type: String, trim: true })
  nameEn?: string;

  @Prop({ type: String, trim: true })
  nameAr?: string;

  // Fallback for legacy compatibility
  @Prop({ type: String, trim: true })
  name?: string;

  @Prop({
    type: String,
    enum: [
      'Drilling',
      'Project',
      'Department',
      'Maintenance',
      'Logistics',
      'HSE',
      'Administrative',
      'Overhead',
      'General',
    ],
    default: 'Department',
  })
  type!: string;

  @Prop({ type: Types.ObjectId, ref: CostCenterModelName, default: null })
  parentId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  parentCode?: string;

  @Prop({ type: Number, default: 1 })
  level!: number;

  @Prop({
    type: String,
    enum: ['HeadOffice', 'FreeZone'],
    default: 'HeadOffice',
  })
  branch!: string;

  @Prop({
    type: String,
    enum: ['Active', 'Inactive', 'Suspended'],
    default: 'Active',
  })
  status!: string;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  @Prop({ type: String, default: null })
  manager?: string;

  @Prop({ type: Number, default: 0 })
  budgetAmount!: number;

  @Prop({ type: Number, default: 0 })
  spentAmount!: number;

  @Prop({ type: Number, default: 0 })
  committedAmount!: number;

  @Prop({ type: Number, default: 0 })
  availableAmount!: number;

  @Prop({ type: Number, default: 0 })
  utilizationPct!: number;

  @Prop({
    type: String,
    enum: ['ok', 'warning', 'danger', 'none'],
    default: 'none',
  })
  alertLevel!: string;

  @Prop({
    type: String,
    enum: ['Rig', 'Project', 'Manual'],
    default: 'Manual',
  })
  sourceType!: string;

  @Prop({ type: Types.ObjectId, default: null })
  sourceId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  sourceCode?: string;

  @Prop({ type: Boolean, default: false })
  autoCreated!: boolean;

  @Prop({ type: Number, default: 0 })
  childrenCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'Contract', default: null })
  contractId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  contractNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  projectCode?: string;

  @Prop({ type: String, default: null })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;
}

export const CostCenterSchema = SchemaFactory.createForClass(CostCenter);

// Indexes
CostCenterSchema.index({ type: 1 });
CostCenterSchema.index({ status: 1 });
CostCenterSchema.index({ isActive: 1 });
CostCenterSchema.index({ parentCode: 1 });
CostCenterSchema.index({ branch: 1 });

export const CostCenterModel = MongooseModule.forFeature([
  { name: CostCenterModelName, schema: CostCenterSchema },
]);
