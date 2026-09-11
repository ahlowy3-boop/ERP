import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

export const DARModelName = 'DAR';

@Schema({ timestamps: true, collection: 'daily_activity_reports' })
export class DAR extends Document {
  @Prop({ type: String, unique: true, sparse: true, default: null })
  darNumber?: string; // DAR-YYYY-XXXX (auto-generated on create)

  @Prop({ type: Types.ObjectId, ref: 'Contract', required: true })
  contractId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  contractNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'Equipment', default: null })
  rigId?: Types.ObjectId;

  @Prop({ type: String, default: '' })
  rigName!: string;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  projectCode?: string;

  @Prop({ type: String, default: null })
  costCenterCode?: string;

  @Prop({ type: Date, required: true })
  reportDate!: Date;

  @Prop({ type: String, enum: ['Day', 'Night', 'Full Day'], default: 'Full Day' })
  shift!: string;

  @Prop({ type: Number, default: 0, min: 0, max: 24 })
  operatingHours!: number;

  @Prop({ type: Number, default: 0, min: 0, max: 24 })
  standbyHours!: number;

  @Prop({ type: Number, default: 0, min: 0, max: 24 })
  repairHours!: number;

  @Prop({ type: Number, default: 0, min: 0, max: 24 })
  downtimeHours!: number;

  @Prop({ type: Number, default: 0 })
  fuelConsumption!: number;

  @Prop({ type: String, default: '' })
  activitiesPerformed!: string;

  @Prop({ type: String, default: 'None' })
  hseIncidents!: string;

  @Prop({ type: String, default: '' })
  weatherConditions!: string;

  @Prop({ type: String, default: '' })
  preparedBy!: string;

  @Prop({
    type: [{ itemName: String, quantity: Number, uom: String }],
    default: [],
  })
  materialsUsed!: { itemName: string; quantity: number; uom: string }[];

  @Prop({
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    default: 'Draft',
  })
  status!: string;

  @Prop({ type: String, default: null })
  clientRepName?: string;

  @Prop({ type: String, default: null })
  clientSignature?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  approvedAt?: Date;

  @Prop({ type: String, default: null })
  rejectionReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;
}

export const DARSchema = SchemaFactory.createForClass(DAR);
DARSchema.index({ contractId: 1, reportDate: -1 });
DARSchema.index({ status: 1 });
DARSchema.index({ projectCode: 1 });

export const DARModel = MongooseModule.forFeature([
  { name: DARModelName, schema: DARSchema },
]);
