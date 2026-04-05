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

  @ToSanitizedString({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  entityType!: string;

  @ToSanitizedString({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
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
