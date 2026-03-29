import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateClinicAdminDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;
}
