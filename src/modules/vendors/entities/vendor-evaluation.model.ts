import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class VendorEvaluation {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendorId!: Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() }) evaluationDate!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' }) evaluatorId?: Types.ObjectId;

  // Scores (0–100)
  @Prop({ type: Number, min: 0, max: 100, required: true }) deliveryScore!: number;
  @Prop({ type: Number, min: 0, max: 100, required: true }) qualityScore!: number;
  @Prop({ type: Number, min: 0, max: 100, required: true }) priceScore!: number;
  @Prop({ type: Number, min: 0, max: 100 }) communicationScore?: number;

  // Computed
  @Prop({ type: Number }) compositeScore?: number;  // 0–100
  @Prop({ type: Number }) calculatedRating?: number; // 0–5

  @Prop({ type: String }) comments?: string;
  @Prop({ type: String }) period?: string; // e.g. '2026-Q3'
}

export const VendorEvaluationSchema = SchemaFactory.createForClass(VendorEvaluation);
export const VendorEvaluationModelName = 'VendorEvaluation';
export type VendorEvaluationDoc = HydratedDocument<VendorEvaluation>;

export const VendorEvaluationMongooseModel = MongooseModule.forFeature([
  { name: VendorEvaluationModelName, schema: VendorEvaluationSchema },
]);
