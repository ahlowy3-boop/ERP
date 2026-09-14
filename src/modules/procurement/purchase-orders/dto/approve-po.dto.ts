import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ApprovePoStepDto {
  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  action?: string;

  @IsString()
  @IsOptional()
  approverName?: string;

  @IsString()
  @IsOptional()
  approvedBy?: string;

  @IsString()
  @IsOptional()
  comments?: string;

  @IsOptional()
  stepOrder?: number;
}
