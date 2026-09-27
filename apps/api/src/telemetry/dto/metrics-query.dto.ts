import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_METRICS_WINDOW_DAYS = 30;
export const MAX_METRICS_WINDOW_DAYS = 180;

/** `GET /clinics/:clinicId/metrics`. The window never exceeds what retention keeps. */
export class MetricsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_METRICS_WINDOW_DAYS)
  days?: number;
}
