import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';
import { CursorLimitQueryDto } from '../../common/request-dto';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class RequestExportDto {
  @IsString()
  @Matches(DATE_ONLY_RE, { message: 'fromDate must be YYYY-MM-DD' })
  fromDate!: string;

  @IsString()
  @Matches(DATE_ONLY_RE, { message: 'toDate must be YYYY-MM-DD' })
  toDate!: string;
}

export class RejectExportDto {
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

const EXPORT_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REJECTED',
  'SKIPPED',
] as const;

/** The run list, optionally narrowed to one status or trigger. */
export class ListResearchExportsQueryDto extends CursorLimitQueryDto {
  @IsOptional()
  @IsIn(EXPORT_STATUSES)
  status?: (typeof EXPORT_STATUSES)[number];

  @IsOptional()
  @IsIn(['MANUAL', 'SCHEDULED'])
  trigger?: 'MANUAL' | 'SCHEDULED';
}
