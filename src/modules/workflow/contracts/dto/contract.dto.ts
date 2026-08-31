import {
  IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber,
  IsDateString, IsEmail, IsArray, ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RateSheetItemDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() @IsNotEmpty() description!: string;
  @IsString() @IsNotEmpty() unit!: string;
  @IsNumber() @Min(0) @Type(() => Number) rate!: number;
  @IsString() @IsNotEmpty() currency!: string;
}

export class MilestoneDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() @IsNotEmpty() title!: string;
  @IsDateString() dueDate!: string;
  @IsNumber() @Min(0) @Type(() => Number) amount!: number;
  @IsEnum(['Pending', 'In Progress', 'Completed', 'Overdue']) status!: string;
  @IsOptional() @IsDateString() completedDate?: string;
}

export class CreateContractDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsNotEmpty() clientName!: string;

  @IsOptional() @IsString() clientContact?: string;
  @IsOptional() @IsEmail() clientEmail?: string;

  @IsEnum(['Daily Rate', 'Lump Sum', 'Unit Rate', 'Time & Material'])
  type!: string;

  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;

  @IsNumber() @Min(0) @Type(() => Number) value!: number;

  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() scope?: string;

  @IsOptional() @IsString() rigId?: string;
  @IsOptional() @IsString() rigName?: string;

  @IsOptional() @IsString() projectManager?: string;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) retentionPercent?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) vatRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) withholdingRate?: number;
  @IsOptional() @IsString() paymentTerms?: string;

  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() gpsCoordinates?: string;
  @IsOptional() @IsString() preferredWarehouse?: string;
  @IsOptional() @IsString() nearestWarehouse?: string;
  @IsOptional() @IsNumber() @Type(() => Number) distanceKm?: number;
  @IsOptional() @IsNumber() @Type(() => Number) estimatedTransportationCost?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RateSheetItemDto)
  rateSheet?: RateSheetItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];

  // Extended fields sent by frontend
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) contractValueEGP?: number;
  @IsOptional() @IsDateString() rateSnapshotDate?: string;
  @IsOptional() @IsString() contractNumber?: string;
  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() costCenterCode?: string;
  @IsOptional() @IsString() parentCostCenter?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
}

export class UpdateContractStatusDto {
  @IsEnum(['Draft', 'Active', 'Completed', 'Suspended', 'Terminated'])
  @IsNotEmpty()
  status!: string;
}
