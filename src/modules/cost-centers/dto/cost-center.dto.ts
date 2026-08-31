import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCostCenterDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum([
    'Drilling',
    'Project',
    'Department',
    'Maintenance',
    'Logistics',
    'HSE',
    'Administrative',
    'Overhead',
    'General',
  ])
  type?: string;

  @IsOptional()
  @IsString()
  parentCode?: string;

  @IsOptional()
  @IsString()
  parentCostCenter?: string;

  @IsOptional()
  @IsEnum(['HeadOffice', 'FreeZone'])
  branch?: string;

  @IsOptional()
  @IsString()
  manager?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  budgetAmount?: number;

  @IsOptional()
  @IsEnum(['Active', 'Inactive', 'Suspended'])
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCostCenterDto {
  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  manager?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  budgetAmount?: number;

  @IsOptional()
  @IsEnum(['Active', 'Inactive', 'Suspended'])
  status?: string;

  @IsOptional()
  @IsString()
  parentCode?: string;

  @IsOptional()
  @IsString()
  parentCostCenter?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
