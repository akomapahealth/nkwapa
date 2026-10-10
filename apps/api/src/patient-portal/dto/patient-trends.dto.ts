import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ListPatientTrendsQueryDto {
  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
