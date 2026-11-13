import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/** What a replayed save says it was based on, and whether it replaced a newer one. */
export interface OverwriteCheck {
  /** `updatedAt` of the server row the device last loaded; absent from older clients. */
  baseUpdatedAt?: string;
  /** Set by the service when the replay replaced a save newer than its base. */
  overwrote?: boolean;
}

/** Pulls the device's base version out of a payload so strict DTOs never see it. */
export function takeBaseUpdatedAt(payload: Record<string, unknown>): {
  payload: Record<string, unknown>;
  baseUpdatedAt?: string;
} {
  const { baseUpdatedAt, ...rest } = payload;
  return {
    payload: rest,
    baseUpdatedAt: typeof baseUpdatedAt === 'string' ? baseUpdatedAt : undefined,
  };
}

/**
 * True when someone saved this row after the version the device edited.
 *
 * Saves still apply (offline work is never lost); the caller audits and notifies instead.
 */
export function overwroteNewerSave(
  current: { updatedAt: Date } | null | undefined,
  baseUpdatedAt: string | undefined,
): boolean {
  if (!current || !baseUpdatedAt) return false;
  const base = Date.parse(baseUpdatedAt);
  return Number.isFinite(base) && current.updatedAt.getTime() > base;
}

export async function auditOverwrite(
  tx: Prisma.TransactionClient,
  params: {
    clinicId: string;
    actorUserId: string;
    entityType: string;
    entityId: string;
    overwrittenUserId: string | null;
    overwrittenAt: Date;
    baseUpdatedAt: string;
    requestId?: string;
  },
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      clinicId: params.clinicId,
      actorUserId: params.actorUserId,
      action: 'CONFLICT_OVERWRITTEN',
      entityType: params.entityType,
      entityId: params.entityId,
      beforeJson: JSON.stringify({
        overwrittenUserId: params.overwrittenUserId,
        overwrittenAt: params.overwrittenAt.toISOString(),
      }),
      afterJson: JSON.stringify({ baseUpdatedAt: params.baseUpdatedAt }),
      requestId: params.requestId ?? randomUUID(),
    },
  });
}
