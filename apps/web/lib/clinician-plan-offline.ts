import {
  sealClinicianPlan,
  type ClinicianPlanCondition,
  type ClinicianPlanSealKey,
} from '@nkwapa/db/clinician-plan-seal';
import { apiFetch, type GetToken } from './api';
import { db, type OutboxRecord } from './db';
import { enqueueOutboxMutation, generateClientId, SYNC_OPERATION } from './outbox';

/**
 * A doctor's clinician plan, recorded without signal (#131).
 *
 * The plan is doctor-only and never cached on a device, so it cannot sit in the outbox as
 * readable JSON. It is sealed to the server's public key before it is queued: this device keeps
 * no key that opens it, so neither the doctor's later session nor anyone with devtools can read
 * it back. Only routing travels in the clear (which encounter, which condition, when decided).
 *
 * The public key is not a secret; it is fetched while online and kept so a doctor who loses
 * signal mid-clinic can still seal. A device that never fetched it cannot queue a plan, and says
 * so.
 */

export const CLINICIAN_PLAN_ENTITY = 'clinician_plan';
const KEY_STORAGE = 'nkwapa-clinician-plan-seal-key';

export function conditionForEndpoint(endpoint: string): ClinicianPlanCondition | null {
  if (endpoint === 'hypertension-assessment') return 'HYPERTENSION';
  if (endpoint === 'diabetes-screening') return 'DIABETES';
  return null;
}

/** The key cached on this device, if any. Never throws: storage can be blocked. */
export function readCachedSealKey(): ClinicianPlanSealKey | null {
  try {
    const raw = window.localStorage.getItem(KEY_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ClinicianPlanSealKey>;
    return typeof parsed.kid === 'string' && typeof parsed.spki === 'string'
      ? { kid: parsed.kid, spki: parsed.spki }
      : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the server's current key and keep it for offline use. Null when the server has none
 * configured, which means the plan stays online-only; the cached key is then dropped too.
 */
export async function refreshSealKey(
  clinicId: string,
  getToken: GetToken,
): Promise<ClinicianPlanSealKey | null> {
  const response = await apiFetch(
    `/sync/clinician-plan-key?clinicId=${encodeURIComponent(clinicId)}`,
    { getToken, activeClinicId: clinicId },
  );
  if (!response.ok) return readCachedSealKey();
  const body = (await response.json()) as { available: boolean; kid?: string; spki?: string };
  try {
    if (body.available && body.kid && body.spki) {
      const key = { kid: body.kid, spki: body.spki };
      window.localStorage.setItem(KEY_STORAGE, JSON.stringify(key));
      return key;
    }
    window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Storage blocked: the key still works for this page.
    return body.available && body.kid && body.spki ? { kid: body.kid, spki: body.spki } : null;
  }
  return null;
}

/** Seal and queue a plan. The plaintext exists only in the caller's memory afterwards. */
export async function queueSealedClinicianPlan(params: {
  key: ClinicianPlanSealKey;
  clinicId: string;
  encounterId: string;
  condition: ClinicianPlanCondition;
  authorUserId: string;
  plan: Record<string, unknown>;
  decidedAt?: Date;
}): Promise<OutboxRecord> {
  const sealed = await sealClinicianPlan(params.key, params.plan, {
    clinicId: params.clinicId,
    encounterId: params.encounterId,
    condition: params.condition,
    authorUserId: params.authorUserId,
  });
  return enqueueOutboxMutation(db, {
    clinicId: params.clinicId,
    entityType: CLINICIAN_PLAN_ENTITY,
    entityId: generateClientId(),
    operation: SYNC_OPERATION.UPSERT,
    payloadJson: {
      schemaVersion: 1,
      encounterId: params.encounterId,
      condition: params.condition,
      decidedAt: (params.decidedAt ?? new Date()).toISOString(),
      sealed,
    },
  }) as Promise<OutboxRecord>;
}

/** Whether `row` is a sealed plan this account queued for this encounter and condition. */
export function isQueuedPlanFor(
  row: Pick<OutboxRecord, 'entityType' | 'payloadJson' | 'ownerUserId'>,
  target: { encounterId: string; condition: ClinicianPlanCondition; userId: string | null },
): boolean {
  if (row.entityType !== CLINICIAN_PLAN_ENTITY || !target.userId) return false;
  if (row.ownerUserId !== target.userId) return false;
  try {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    return payload.encounterId === target.encounterId && payload.condition === target.condition;
  } catch {
    return false;
  }
}
