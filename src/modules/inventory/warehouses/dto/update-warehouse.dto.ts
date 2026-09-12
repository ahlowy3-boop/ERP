import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @IsNotEmpty() code?: string;
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsEnum(['Active', 'Inactive']) status?: string;
}
