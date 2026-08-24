import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AssetCategoryModelName } from './entities/category.model';
import { EquipmentModelName } from '../equipment/entities/equipment.model';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectModel(AssetCategoryModelName) private categoryModel: Model<any>,
    @InjectModel(EquipmentModelName) private equipmentModel: Model<any>,
  ) {}

  // ─── Find All (active only, with assetCount) ──────────────────────────────
  async findAll() {
    const categories = await this.categoryModel
      .find({ isActive: true })
      .sort({ code: 1 })
      .lean()
      .exec();

    // Attach assetCount from equipment collection for each category
    const withCounts = await Promise.all(
      categories.map(async (cat: any) => {
        const assetCount = await this.equipmentModel.countDocuments({
          category: cat.code,
        });
        return { ...cat, assetCount };
      }),
    );

    return { data: withCounts };
  }

  // ─── Create ───────────────────────────────────────────────────────────────
  async create(dto: any) {
    const existing = await this.categoryModel
      .findOne({ code: String(dto.code).toUpperCase() })
      .lean();
    if (existing) {
      throw new ConflictException(
        `Asset category code "${dto.code}" already exists`,
      );
    }

    const category = await this.categoryModel.create(dto);
    this.logger.log(`Asset Category created: ${category.code}`);
    return { message: 'Asset category created successfully', data: category };
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  async update(id: string, dto: any) {
    const category = await this.categoryModel.findById(id);
    if (!category) throw new NotFoundException('Asset category not found');

    // code is immutable — strip it from update
    const { code, ...safeDto } = dto;

    const updated = await this.categoryModel
      .findByIdAndUpdate(id, { $set: safeDto }, { new: true })
      .lean();

    this.logger.log(`Asset Category ${category.code} updated`);
    return { message: 'Asset category updated successfully', data: updated };
  }
}
