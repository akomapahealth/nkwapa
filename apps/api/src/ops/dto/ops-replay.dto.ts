import { CheckInSource, ShiftRole } from '@prisma/client';
import {
  Equals,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

/**
 * Payloads of the clinic-operations changes the offline outbox replays.
 *
 * The record's id is the mutation's `entityId`, never part of the payload, so a payload cannot
 * name a different record from the one its idempotency record points at.
 */
abstract class OpsReplayPayload {
  @Equals(1)
  schemaVersion!: 1;

  /** When the action happened on the device. */
  @IsISO8601({ strict: true })
  occurredAt!: string;
}

export class ShiftCheckInReplayPayload extends OpsReplayPayload {
  @IsEnum(ShiftRole)
  roleAtShift!: ShiftRole;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ShiftCheckOutReplayPayload extends OpsReplayPayload {}

export class PatientCheckInReplayPayload extends OpsReplayPayload {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsEnum(CheckInSource)
  source?: CheckInSource;

  @IsOptional()
  @ToSanitizedString({ maxLength: 2000, preserveNewlines: true })
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
