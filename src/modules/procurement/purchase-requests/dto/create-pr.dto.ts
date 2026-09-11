import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class CreatePurchaseRequestItemDto {
  // ── Required by schema ──────────────────────────────────────────
  @IsOptional() @IsString() itemId?: string;       // MongoDB _id of the item

  @IsString() @IsNotEmpty() itemType!: string;

  // ── Optional fields sent by frontend ────────────────────────────
  @IsOptional() @IsString() itemCode?: string;
  @IsOptional() @IsString() itemName?: string;
  @IsOptional() @IsNumber() @Type(() => Number) quantity?: number;
  @IsOptional() @IsString() uom?: string;

  @IsOptional() @IsString() itemDescription?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() @Type(() => Number) estimatedUnitCost?: number;

  @IsOptional() @IsString() serviceDescription?: string;
  @IsOptional() @IsString() scopeOfWork?: string;
  @IsOptional() @IsNumber() @Type(() => Number) estimatedCost?: number;

  @IsOptional() @IsNumber() @Type(() => Number) currentStock?: number;
  @IsOptional() @IsNumber() @Type(() => Number) availableQty?: number;
  @IsOptional() @IsNumber() @Type(() => Number) shortageQty?: number;
  @IsOptional() @IsBoolean() allowPartialIssue?: boolean;
  @IsOptional() @IsNumber() @Type(() => Number) fulfillFromStock?: number;
  @IsOptional() @IsNumber() @Type(() => Number) fulfillByPurchase?: number;
}

export class CreatePurchaseRequestDto {
  // ── Required by schema ──────────────────────────────────────────
  @IsOptional() @IsString() requesterId?: string;    // User _id
  @IsOptional() @IsString() departmentId?: string;   // Department _id
  @IsOptional() @IsString() requestDate?: string;    // ISO date string

  // ── Other fields ────────────────────────────────────────────────
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

  @IsOptional() @IsString() requiredDate?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() requestedBy?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseRequestItemDto)
  items!: CreatePurchaseRequestItemDto[];
}
