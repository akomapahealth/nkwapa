import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ToSanitizedString } from '../../common/validation';
import { ClinicIdParamDto } from '../../common/request-dto';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CADENCES = ['WEEKLY', 'MONTHLY'] as const;
const DESTINATIONS = ['R2', 'GITHUB', 'LOCAL'] as const;

export class ClinicAndScheduleParamsDto extends ClinicIdParamDto {
  @IsUUID()
  scheduleId!: string;
}

/** A schedule's cadence and scope. Edits send the whole shape, so it is validated as one. */
export class ResearchScheduleDto {
  @IsIn(CADENCES)
  cadence!: (typeof CADENCES)[number];

  @ValidateIf((dto: ResearchScheduleDto) => dto.cadence === 'WEEKLY')
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number | null;

  /** 1 to 28, so February never skips a run. */
  @ValidateIf((dto: ResearchScheduleDto) => dto.cadence === 'MONTHLY')
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number | null;

  @IsInt()
  @Min(0)
  @Max(23)
  localHour!: number;

  @IsString()
  @Matches(DATE_ONLY_RE, { message: 'coverageStartDate must be YYYY-MM-DD' })
  coverageStartDate!: string;

  /** Defaults to the environment's recommended destination. */
  @IsOptional()
  @IsIn(DESTINATIONS)
  destination?: (typeof DESTINATIONS)[number];
}

export class ApproveScheduleDto {
  /** When the standing approval must be looked at again; defaults to twelve months. */
  @IsOptional()
  @IsISO8601({ strict: true })
  reviewBy?: string;
}

/** Reject, revoke, or rerun: each needs a reason a reviewer can read later. */
export class ResearchReasonDto {
  @ToSanitizedString({ maxLength: 500, preserveNewlines: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
