import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { AssetCategoryModel } from './entities/category.model';
import { EquipmentModel } from '../equipment/entities/equipment.model';

@Module({
  imports: [AssetCategoryModel, EquipmentModel],
  providers: [CategoriesService],
  controllers: [CategoriesController],
  exports: [CategoriesService, AssetCategoryModel],
})
export class AssetCategoriesModule {}
