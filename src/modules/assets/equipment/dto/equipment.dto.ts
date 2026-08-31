import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEquipmentDto {
  @IsString()
  @IsNotEmpty()
  assetNumber!: string;

  @IsString()
  @IsNotEmpty()
  equipmentCode!: string;

  @IsString()
  @IsNotEmpty()
  equipmentName!: string;

  @IsEnum([
    'Rig',
    'Generator',
    'Crane',
    'Truck',
    'Pump',
    'Compressor',
    'Heavy Equipment',
    'Safety Equipment',
  ])
  category!: string;

  @IsString()
  @IsNotEmpty()
  manufacturer!: string;

  @IsString()
  @IsNotEmpty()
  modelName!: string;

  @IsString()
  @IsNotEmpty()
  serialNumber!: string;

  @IsDateString()
  purchaseDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchaseCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  currentValue?: number;

  @IsOptional()
  @IsString()
  depreciationMethod?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  costCenter?: string;

  @IsOptional()
  @IsString()
  costCenterCode?: string;

  @IsOptional()
  @IsString()
  costCenterName?: string;

  @IsOptional()
  @IsString()
  parentCostCenter?: string;

  @IsOptional()
  @IsString()
  parentCostCenterCode?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(['Active', 'Standby', 'Maintenance', 'Out Of Service'])
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  operatingHours?: number;

  @IsOptional()
  @IsDateString()
  lastMaintenanceDate?: string;

  @IsOptional()
  @IsDateString()
  nextMaintenanceDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEquipmentStatusDto {
  @IsEnum(['Active', 'Standby', 'Maintenance', 'Out Of Service'])
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  projectAssignment?: string;
}
