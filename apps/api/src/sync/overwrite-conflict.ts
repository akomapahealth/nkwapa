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

// Audit rows are stamped by the database clock and rows by the API's; this window absorbs skew.
const CLOCK_SKEW_MS = 10 * 60 * 1000;

/**
 * Who made a save, of one of `actions`, that the device never saw.
 *
 * `updatedAt` alone cannot answer this: a clinician plan or anything else that touches the row
 * bumps it too. Each save's audit event holds the row it wrote, so this compares that row's
 * `updatedAt` (the same clock as the base) and ignores the caller's own saves.
 */
export async function findOverwrittenSave(
  tx: Prisma.TransactionClient,
  params: {
    clinicId: string;
    entityType: string;
    entityId: string;
    actions: string[];
    actorUserId: string;
    baseUpdatedAt: string;
  },
): Promise<{ userId: string; savedAt: Date } | null> {
  const base = Date.parse(params.baseUpdatedAt);
  if (!Number.isFinite(base)) return null;
  const events = await tx.auditEvent.findMany({
    where: {
      clinicId: params.clinicId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: { in: params.actions },
      actorUserId: { not: params.actorUserId },
      createdAt: { gte: new Date(base - CLOCK_SKEW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { actorUserId: true, afterJson: true },
  });
  for (const event of events) {
    const savedAt = savedUpdatedAt(event.afterJson);
    if (savedAt !== null && savedAt > base) {
      return { userId: event.actorUserId, savedAt: new Date(savedAt) };
    }
  }
  return null;
}

function savedUpdatedAt(afterJson: string | null): number | null {
  if (!afterJson) return null;
  try {
    const row = JSON.parse(afterJson) as { updatedAt?: unknown };
    const at = typeof row.updatedAt === 'string' ? Date.parse(row.updatedAt) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
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
