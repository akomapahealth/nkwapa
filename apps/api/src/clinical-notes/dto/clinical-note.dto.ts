import { IsInt, IsString, Length, Min } from 'class-validator';
import {
  CLINICAL_NOTE_ADDENDUM_CONTENT_MAX_LENGTH,
  CLINICAL_NOTE_ADDENDUM_REASON_MAX_LENGTH,
  CLINICAL_NOTE_SECTION_MAX_LENGTH,
} from '@nkwapa/db';

export class ClinicalNoteDraftDto {
  @IsString()
  @Length(0, CLINICAL_NOTE_SECTION_MAX_LENGTH)
  history!: string;

  @IsString()
  @Length(0, CLINICAL_NOTE_SECTION_MAX_LENGTH)
  assessment!: string;

  @IsString()
  @Length(0, CLINICAL_NOTE_SECTION_MAX_LENGTH)
  plan!: string;
}

export class UpdateClinicalNoteDraftDto extends ClinicalNoteDraftDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class AddClinicalNoteAddendumDto {
  @IsString()
  @Length(1, CLINICAL_NOTE_ADDENDUM_REASON_MAX_LENGTH)
  reason!: string;

  @IsString()
  @Length(1, CLINICAL_NOTE_ADDENDUM_CONTENT_MAX_LENGTH)
  content!: string;
}
