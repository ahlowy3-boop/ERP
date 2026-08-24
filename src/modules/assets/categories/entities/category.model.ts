import { Schema } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

export const AssetCategoryModelName = 'AssetCategory';

export const AssetCategorySchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    nameAr: { type: String },
    usefulLifeYears: { type: Number, required: true, min: 1, max: 50 },
    depreciationMethod: {
      type: String,
      enum: ['Straight-Line', 'Declining-Balance', 'Units-of-Production'],
      default: 'Straight-Line',
    },
    salvageValuePercent: { type: Number, default: 10, min: 0, max: 50 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const AssetCategoryModel = MongooseModule.forFeature([
  { name: AssetCategoryModelName, schema: AssetCategorySchema },
]);
