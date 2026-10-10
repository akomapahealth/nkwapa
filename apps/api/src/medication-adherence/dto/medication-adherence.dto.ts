import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MedicationAdherenceContext,
  MedicationAdherenceLevel,
  MedicationDosesMissed,
  MedicationProblem,
  MedicationSupplyStatus,
  NkwapaAnswer,
} from '@prisma/client';
import { ADHERENCE_PROBLEMS_OTHER_MAX_LENGTH } from '@nkwapa/db';
import { ToSanitizedString } from '../../common/validation';

/**
 * A clinic's reconciled list is a handful of medications, not a thousand.
 *
 * The cap exists so one malformed replay cannot ask the server to open a transaction over an
 * unbounded set; it is generous enough that no real patient reaches it.
 */
export const MAX_ADHERENCE_ENTRIES = 100;

/**
 * One observation about one reconciled medication.
 *
 * The condition-specific columns are all accepted here and then held at `NOT_ASSESSED` by
 * `applyAdherenceContextRules` in `@nkwapa/db` before the write. Rejecting them at the DTO instead
 * would mean two DTOs that differ by two fields, and a client sending a default `NOT_ASSESSED` for
 * the other condition -- which is what the form's empty entry looks like -- would be refused for
 * saying nothing.
 */
export class MedicationAdherenceEntryDto {
  @IsUUID()
  medicationRecordId!: string;

  /**
   * The revision the volunteer had on screen.
   *
   * Recorded so a later reconciliation cannot silently re-point an observation at a different
   * dose. The service checks it belongs to `medicationRecordId`.
   */
  @IsUUID()
  observedRevisionId!: string;

  @IsEnum(NkwapaAnswer)
  tookToday!: NkwapaAnswer;

  @IsEnum(MedicationDosesMissed)
  dosesMissed7d!: MedicationDosesMissed;

  @IsEnum(MedicationAdherenceLevel)
  takingAsPrescribed!: MedicationAdherenceLevel;

  @IsEnum(MedicationSupplyStatus)
  supplyRemaining!: MedicationSupplyStatus;

  @IsArray()
  @IsEnum(MedicationProblem, { each: true })
  @ArrayMaxSize(Object.keys(MedicationProblem).length)
  problems!: MedicationProblem[];

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: ADHERENCE_PROBLEMS_OTHER_MAX_LENGTH })
  @IsString()
  @MaxLength(ADHERENCE_PROBLEMS_OTHER_MAX_LENGTH)
  problemsOther!: string | null;
}

/**
 * The whole set for one encounter and one condition, replaced wholesale.
 *
 * Not a per-row PUT. The unique key is `(encounterId, context, medicationRecordId)`, and a
 * medication the volunteer removed from the reconciled list must not leave an orphaned observation
 * behind claiming the patient is still on it. Sending the set is also what lets one interview save
 * write the assessment and its adherence together, so a tab switch saves both or neither.
 */
export class UpsertMedicationAdherenceDto {
  @IsEnum(MedicationAdherenceContext)
  context!: MedicationAdherenceContext;

  @IsArray()
  @ArrayMaxSize(MAX_ADHERENCE_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => MedicationAdherenceEntryDto)
  entries!: MedicationAdherenceEntryDto[];
}
