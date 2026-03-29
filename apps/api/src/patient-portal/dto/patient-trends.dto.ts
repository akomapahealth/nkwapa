import { IsOptional, IsString } from 'class-validator';

export class ListPatientTrendsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
