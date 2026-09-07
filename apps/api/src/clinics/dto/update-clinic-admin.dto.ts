import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeLocationCode } from '@nkwapa/db';
import { ClinicMetadataDto } from './clinic-metadata.dto';
import { ToOptionalBoolean } from '../../common/validation';
import { IsLocationCode } from '../../common/clinic-metadata.validator';

export class UpdateClinicAdminDto extends ClinicMetadataDto {
  /**
   * Optional on update, but never clearable: omitting it leaves the code alone, while sending
   * an empty one is rejected rather than written. The old guard was `!= null`, so `''` trimmed
   * to empty and was stored, leaving a clinic that reporting could not identify.
   */
  @IsOptional()
  @Transform(({ value }) => normalizeLocationCode(value))
  @IsLocationCode()
  locationCode?: string;

  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  isActive?: boolean;
}
