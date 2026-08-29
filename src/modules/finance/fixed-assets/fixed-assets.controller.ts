import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EquipmentModelName } from '../../assets/equipment/entities/equipment.model';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('finance/fixed-assets')
export class FixedAssetsController {
  constructor(
    @InjectModel(EquipmentModelName) private equipmentModel: Model<any>,
  ) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  async getFixedAssets(@Query() query: any) {
    const { status, category, search, page = 1, limit = 20 } = query;
    const filter: any = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { equipmentName: { $regex: search, $options: 'i' } },
        { equipmentCode: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [assets, total] = await Promise.all([
      this.equipmentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.equipmentModel.countDocuments(filter),
    ]);
    const data = assets.map((a: any) => ({
      _id: a._id?.toString(),
      id: a._id?.toString(),
      assetCode: a.equipmentCode || a.assetNumber,
      assetName: a.equipmentName,
      category: a.category,
      purchaseCost: a.purchaseCost || 0,
      purchaseDate: a.purchaseDate,
      usefulLifeYears: a.usefulLifeYears || 10,
      residualValue: a.residualValue || 0,
      depreciationMethod: a.depreciationMethod || 'Straight-Line',
      accumulatedDepreciation: a.accumulatedDepreciation || 0,
      currentBookValue: (a.purchaseCost || 0) - (a.accumulatedDepreciation || 0),
      monthlyDepreciation: a.monthlyDepreciation || 0,
      lastDepreciationDate: a.lastDepreciationDate,
      status: a.status,
      location: a.location,
      costCenter: a.costCenter,
    }));
    const totalCost = data.reduce((s: number, a: any) => s + a.purchaseCost, 0);
    const totalBookValue = data.reduce((s: number, a: any) => s + a.currentBookValue, 0);
    const totalAccDep = data.reduce((s: number, a: any) => s + a.accumulatedDepreciation, 0);
    return {
      data,
      total,
      page: Number(page),
      kpis: {
        totalAssets: total,
        totalCost,
        totalBookValue,
        totalAccumulatedDep: totalAccDep,
        monthlyDepCharge: 0,
      },
    };
  }

  @Post(':id/capitalize')
  @Roles(UserRole.SuperAdmin, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  async capitalize(@Param('id') id: string, @Body() dto: any) {
    const asset = await this.equipmentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            capitalizedAt: dto.capitalizationDate,
            coaCode: dto.coaCode,
            capitalizationNotes: dto.notes,
          },
        },
        { new: true },
      )
      .lean();
    if (!asset) return { message: 'Asset not found', success: false };
    return {
      message: 'Asset capitalized successfully',
      data: { ...(asset as any), id: (asset as any)._id?.toString() },
    };
  }

  @Post(':id/dispose')
  @Roles(UserRole.SuperAdmin, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  async dispose(@Param('id') id: string, @Body() dto: any) {
    const asset = await this.equipmentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'Disposed',
            disposalDate: dto.disposalDate,
            disposalValue: dto.disposalValue,
            disposalMethod: dto.disposalMethod,
          },
        },
        { new: true },
      )
      .lean();
    if (!asset) return { message: 'Asset not found', success: false };
    return {
      message: 'Asset disposed successfully',
      data: { ...(asset as any), id: (asset as any)._id?.toString() },
    };
  }

  @Post(':id/transfer')
  @Roles(UserRole.SuperAdmin, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  async transfer(@Param('id') id: string, @Body() dto: any) {
    const asset = await this.equipmentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            location: dto.newLocation,
            costCenter: dto.newCostCenter,
          },
        },
        { new: true },
      )
      .lean();
    if (!asset) return { message: 'Asset not found', success: false };
    return {
      message: 'Asset transferred successfully',
      data: { ...(asset as any), id: (asset as any)._id?.toString() },
    };
  }
}
