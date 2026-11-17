import { IsIn, IsOptional, Matches } from 'class-validator';
import { FOLLOW_UP_METRIC_FIGURES, type FollowUpMetricFigure } from '../follow-up-metrics';

export class FollowUpMetricsQueryDto {
  /** `YYYY-MM`; the current month when absent. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

export class FollowUpMetricPatientsQueryDto extends FollowUpMetricsQueryDto {
  @IsIn(FOLLOW_UP_METRIC_FIGURES)
  figure!: FollowUpMetricFigure;
}
