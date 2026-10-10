import { PatientDuplicateReviewStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DUPLICATE_CONFIDENCE_LEVELS, DUPLICATE_MATCH_REASONS } from '@nkwapa/db';
import { ToOptionalNumber, ToSanitizedString } from '../../common/validation';

/**
 * `ALL` is spelled out rather than expressed by omitting the filter, because omitting it has to
 * mean something else: an unfiltered queue would show every pair an operator has already
 * dismissed, so the default is `OPEN`.
 */
export const DUPLICATE_REVIEW_STATUS_FILTERS = [
  ...Object.values(PatientDuplicateReviewStatus),
  'ALL',
] as const;

export const DUPLICATE_CONFIDENCE_FILTERS = [...DUPLICATE_CONFIDENCE_LEVELS, 'ALL'] as const;

export class ListDuplicateCandidatesQueryDto {
  @IsOptional()
  @IsIn(DUPLICATE_REVIEW_STATUS_FILTERS)
  status?: (typeof DUPLICATE_REVIEW_STATUS_FILTERS)[number];

  @IsOptional()
  @IsIn(DUPLICATE_CONFIDENCE_FILTERS)
  confidence?: (typeof DUPLICATE_CONFIDENCE_FILTERS)[number];

  @IsOptional()
  @IsIn(DUPLICATE_MATCH_REASONS)
  reason?: (typeof DUPLICATE_MATCH_REASONS)[number];

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
}
