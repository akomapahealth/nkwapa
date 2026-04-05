import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

export class CreatePrescriptionDto {
  @IsUUID()
  drugId!: string;

  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  dosage!: string;

  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  frequency!: string;

  @IsOptional()
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  duration?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
