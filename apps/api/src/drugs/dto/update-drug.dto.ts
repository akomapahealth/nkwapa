import { DrugCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToOptionalBoolean, ToSanitizedString } from '../../common/validation';

export class UpdateDrugDto {
  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  genericName?: string;

  @IsOptional()
  @IsEnum(DrugCategory)
  category?: DrugCategory;

  @IsOptional()
  @ToSanitizedString({ maxLength: 500, preserveNewlines: true })
  @IsString()
  @MaxLength(500)
  dosageForms?: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  contraindications?: string;

  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  isActive?: boolean;
}
