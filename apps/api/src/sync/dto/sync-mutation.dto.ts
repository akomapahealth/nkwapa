import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ToSanitizedString } from '../../common/validation';
import { SYNC_ENTITY_TYPES } from '../sync-permissions';

export const SYNC_OPERATION = {
  UPSERT: 'UPSERT',
  DELETE: 'DELETE',
} as const;

export type SyncOperationType = (typeof SYNC_OPERATION)[keyof typeof SYNC_OPERATION];

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
}
