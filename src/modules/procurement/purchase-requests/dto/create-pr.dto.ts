import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsDate,
} from 'class-validator';

export class CreatePurchaseRequestItemDto {
  @IsString() @IsNotEmpty() itemType!: string;

  @IsOptional() @IsString() itemCode?: string;
  @IsOptional() @IsString() itemName?: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() uom?: string;

  @IsOptional() @IsString() itemDescription?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() estimatedUnitCost?: number;

  @IsOptional() @IsString() serviceDescription?: string;
  @IsOptional() @IsString() scopeOfWork?: string;
  @IsOptional() @IsNumber() estimatedCost?: number;

  @IsOptional() @IsNumber() currentStock?: number;
  @IsOptional() @IsNumber() availableQty?: number;
  @IsOptional() @IsNumber() shortageQty?: number;
  @IsOptional() @IsBoolean() allowPartialIssue?: boolean;
  @IsOptional() @IsNumber() fulfillFromStock?: number;
  @IsOptional() @IsNumber() fulfillByPurchase?: number;
}

export class CreatePurchaseRequestDto {
  @IsString() @IsNotEmpty() department!: string;
  @IsString() @IsNotEmpty() costCenter!: string;
  @IsOptional() @IsString() costCenterCode?: string;
  @IsOptional() @IsString() costCenterName?: string;
  @IsOptional() @IsString() parentCostCenter?: string;
  @IsOptional() @IsString() parentCostCenterCode?: string;
  @IsString() @IsNotEmpty() chargeType!: string;

  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() projectName?: string;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() assetName?: string;

  @Type(() => Date) @IsDate() @IsNotEmpty() requiredDate!: Date;
  @IsString() @IsNotEmpty() description!: string;
  @IsString() @IsNotEmpty() requestedBy!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseRequestItemDto)
  items!: CreatePurchaseRequestItemDto[];
}
