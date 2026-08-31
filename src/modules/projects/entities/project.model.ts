import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

export const ProjectModelName = 'Project';

@Schema({ timestamps: true, collection: 'projects' })
export class Project extends Document {
  @Prop({ required: true, unique: true, trim: true })
  code!: string; // e.g. PROJ-CON-2026-001

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, default: null })
  nameAr?: string;

  // Contract reference
  @Prop({ type: Types.ObjectId, ref: 'Contract', default: null })
  contractId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  contractNumber?: string;

  // Cost Center reference
  @Prop({ type: Types.ObjectId, ref: 'CostCenter', default: null })
  costCenterId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  costCenterCode?: string;

  @Prop({ type: String, default: null })
  costCenterName?: string;

  @Prop({ type: String, default: null })
  parentCostCenter?: string;

  @Prop({ type: String, default: null })
  parentCostCenterCode?: string;

  // Client
  @Prop({ type: String, default: '' })
  customer!: string;

  @Prop({ type: String, default: null })
  clientContact?: string;

  @Prop({ type: String, default: null })
  clientEmail?: string;

  // Assigned Rig / Equipment
  @Prop({ type: Types.ObjectId, ref: 'Equipment', default: null })
  rigId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  rigName?: string;

  // Location
  @Prop({ type: String, default: null })
  siteLocation?: string;

  @Prop({ type: String, default: null })
  country?: string;

  @Prop({ type: String, default: null })
  region?: string;

  @Prop({ type: String, default: null })
  siteName?: string;

  @Prop({ type: String, default: null })
  gpsCoordinates?: string;

  @Prop({ type: String, default: null })
  preferredWarehouse?: string;

  @Prop({ type: String, default: null })
  nearestWarehouse?: string;

  @Prop({ type: Number, default: null })
  distanceKm?: number;

  @Prop({ type: Number, default: null })
  estimatedTransportationCost?: number;

  // Financials
  @Prop({ type: Number, default: 0 })
  contractValue!: number;

  @Prop({ type: Number, default: 0 })
  budgetValue!: number;

  @Prop({ type: Number, default: 0 })
  consumedValue!: number;

  @Prop({ type: Number, default: 0 })
  remainingValue!: number;

  @Prop({ type: String, default: 'USD' })
  currency!: string;

  // Dates
  @Prop({ type: Date, required: true })
  startDate!: Date;

  @Prop({ type: Date, required: true })
  endDate!: Date;

  // Progress
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  progressPercent!: number;

  // Status
  @Prop({
    type: String,
    enum: ['Active', 'On_Hold', 'Completed', 'Cancelled', 'Suspended', 'Delayed'],
    default: 'Active',
  })
  status!: string;

  // Team
  @Prop({ type: String, default: null })
  projectManager?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  managerId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

// Note: code is unique via @Prop({ unique: true })
ProjectSchema.index({ contractNumber: 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ customer: 1 });
ProjectSchema.index({ costCenterCode: 1 });

export const ProjectModel = MongooseModule.forFeature([
  { name: ProjectModelName, schema: ProjectSchema },
]);
