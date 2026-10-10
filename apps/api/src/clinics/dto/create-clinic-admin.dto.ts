import { IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeLocationCode } from '@nkwapa/db';
import { ClinicMetadataDto } from './clinic-metadata.dto';
import { IsLocationCode } from '../../common/clinic-metadata.validator';

export class CreateClinicAdminDto extends ClinicMetadataDto {
  @IsString()
  @MaxLength(200)
  declare name: string;

  /**
   * Required on create.
   *
   * It used to be derived silently from the clinic name, which meant two clinics with the
   * same name in one organization produced the same code and collided on the
   * (organizationId, locationCode) unique key as an unmapped 500. The admin UI still
   * prefills the derived value, so the operator confirms a code rather than inventing one.
   */
  @Transform(({ value }) => normalizeLocationCode(value))
  @IsLocationCode()
  locationCode!: string;
}
