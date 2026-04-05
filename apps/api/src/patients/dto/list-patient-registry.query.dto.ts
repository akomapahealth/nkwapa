import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ToCursor, ToOptionalNumber, ToSanitizedString } from '../../common/validation';

export class ListPatientRegistryQueryDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  q?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @ToCursor()
  cursor?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
