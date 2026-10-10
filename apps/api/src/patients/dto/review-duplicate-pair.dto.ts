import { PatientDuplicateReviewStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

/**
 * The pair travels in the body rather than the path.
 *
 * A pair key is two UUIDs joined by a colon, which makes an unreadable path segment and puts the
 * burden of validating it on the route. Two declared UUID fields are validated by the pipe, and
 * the service derives the canonical sorted key from them.
 */
export class ReviewDuplicatePairDto {
  @IsUUID()
  patientAId!: string;

  @IsUUID()
  patientBId!: string;

  @IsEnum(PatientDuplicateReviewStatus)
  status!: PatientDuplicateReviewStatus;

  @IsOptional()
  @ToSanitizedString({ maxLength: 280 })
  note?: string;
}
