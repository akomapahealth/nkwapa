import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateClinicAdminDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
