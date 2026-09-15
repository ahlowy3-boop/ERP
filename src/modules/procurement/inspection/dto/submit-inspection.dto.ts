import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  IsDate,
  IsOptional,
} from 'class-validator';

export class InspectedItemDto {
  @IsString() @IsOptional() itemId?: string;
  @IsString() @IsNotEmpty() itemCode!: string;
  @IsString() @IsOptional() itemName?: string;
  @IsNumber() @IsOptional() quantityOrdered?: number;
  @IsNumber() @IsOptional() quantityReceived?: number;
  @IsNumber() @IsNotEmpty() quantityAccepted!: number;
  @IsNumber() @IsNotEmpty() quantityRejected!: number;
  @IsString() @IsOptional() uom?: string;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() remarks?: string;
}

export class SubmitInspectionDto {
  @IsString() @IsNotEmpty() inspectorName!: string;
  @Type(() => Date) @IsDate() @IsNotEmpty() inspectionDate!: Date;
  @IsEnum(['Accepted', 'Rejected', 'Conditional'])
  @IsNotEmpty()
  status!: string;
  @IsString() @IsOptional() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectedItemDto)
  @IsNotEmpty()
  items!: InspectedItemDto[];
}
