import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OFFLINE_UNLOCK_METHODS, type OfflineUnlockMethod } from '@nkwapa/db';
import { ToSanitizedString } from '../../common/validation';
import { SYNC_ENTITY_TYPES } from '../sync-permissions';

export const SYNC_OPERATION = {
  UPSERT: 'UPSERT',
  DELETE: 'DELETE',
} as const;

export type SyncOperationType = (typeof SYNC_OPERATION)[keyof typeof SYNC_OPERATION];

/** Stamped on a write queued in an offline session (#207). */
export class OfflineSessionStampDto {
  @IsUUID()
  grantId!: string;

  @IsUUID()
  deviceId!: string;

  @IsIn(OFFLINE_UNLOCK_METHODS)
  unlockMethod!: OfflineUnlockMethod;
}

export class SyncMutationDto {
  @ToSanitizedString({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  id!: string;

  // Constrained to the types the dispatcher knows, so an unrecognised value is a 400 at the
  // boundary rather than a per-row error after the request has been accepted.
  @IsIn(SYNC_ENTITY_TYPES)
  entityType!: string;

  // Used directly as a database primary key, so it has to be a real identifier. Every client
  // generates it with crypto.randomUUID().
  @IsUUID()
  entityId!: string;

  @IsIn(Object.values(SYNC_OPERATION))
  operation!: SyncOperationType;

  @IsUUID()
  clinicId!: string;

  @IsOptional()
  @IsObject()
  payloadJson?: Record<string, unknown>;

  @ToSanitizedString({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsDateString()
  createdAt?: string;

  /**
   * Present when the change was recorded in an offline session. The server refuses it if that
   * grant was revoked or the change was recorded after it expired, and stores it with the audit.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => OfflineSessionStampDto)
  offlineSession?: OfflineSessionStampDto;
}
