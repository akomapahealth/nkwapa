import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CounsellingTopic, FollowUpWindow, ReferralUrgency } from '@prisma/client';
import { ToSanitizedString } from '../../common/validation';

export class UpsertCounsellingDto {
  /** The version the editor started from. Required to change an existing record. */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsEnum(CounsellingTopic, { each: true })
  topics!: CounsellingTopic[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  topicOther?: string | null;

  @ToSanitizedString({ maxLength: 5000, preserveNewlines: true })
  @IsString()
  @MaxLength(5000)
  adviceGiven!: string;

  @IsBoolean()
  followUpRecommended!: boolean;

  @IsEnum(FollowUpWindow)
  followUpWindow!: FollowUpWindow;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  followUpOther?: string | null;

  @IsBoolean()
  referralRecommended!: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  referralTo?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  referralReason?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(ReferralUrgency)
  referralUrgency?: ReferralUrgency | null;
}
