import { IsOptional, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class StaffActivityQueryDto {
  /** First clinic-local day, inclusive. Defaults to 6 days before `to`. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  /** Last clinic-local day, inclusive. Defaults to today in the clinic's timezone. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
