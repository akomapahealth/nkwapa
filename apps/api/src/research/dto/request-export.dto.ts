import { IsString, Matches, MaxLength } from "class-validator";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class RequestExportDto {
  @IsString()
  @Matches(DATE_ONLY_RE, { message: "fromDate must be YYYY-MM-DD" })
  fromDate!: string;

  @IsString()
  @Matches(DATE_ONLY_RE, { message: "toDate must be YYYY-MM-DD" })
  toDate!: string;
}

export class RejectExportDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}
