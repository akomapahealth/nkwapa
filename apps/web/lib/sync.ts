'use client';

import { db } from './db';
import type { SyncPullResponseDto } from './sync-types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export type SyncStatusListener = (status: SyncStatus, error?: string) => void;

const listeners: Set<SyncStatusListener> = new Set();

export function onSyncStatusChange(listener: SyncStatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyStatus(status: SyncStatus, error?: string) {
  listeners.forEach((fn) => fn(status, error));
}

export interface SyncNowOptions {
  clinicId: string;
  getAccessToken?: () => Promise<string | null>;
}

export async function syncNow(
  options: SyncNowOptions
): Promise<{ success: boolean; error?: string; conflicts?: Array<{ id: string; conflictType?: string; conflictDetails?: Record<string, unknown> }> }> {
  const { clinicId, getAccessToken } = options;
  notifyStatus('syncing');

  try {
    const token = getAccessToken ? await getAccessToken() : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const syncState = await db.sync_state.get(clinicId);
    const cursor = syncState?.cursor ?? '';
    const pending = await db.outbox.where('clinicId').equals(clinicId).sortBy('createdAt');

    if (pending.length > 0) {
      const mutations = pending.map((m) => ({
        id: m.id,
        entityType: m.entityType,
        entityId: m.entityId,
        operation: m.operation,
        clinicId: m.clinicId,
        payloadJson: JSON.parse(m.payloadJson) as Record<string, unknown>,
        idempotencyKey: m.idempotencyKey,
        createdAt: m.createdAt,
      }));

      const pushRes = await fetch(
        `${API_BASE}/sync/push?clinicId=${encodeURIComponent(clinicId)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(mutations),
        }
      );

      if (!pushRes.ok) {
        const errText = await pushRes.text();
        notifyStatus('error', errText);
        return { success: false, error: errText };
      }

      const pushJson = (await pushRes.json()) as {
        results: Array<{
          id: string;
          status: string;
          conflictType?: string;
          conflictDetails?: Record<string, unknown>;
        }>;
      };

      const appliedIds = new Set(
        pushJson.results
          .filter((r) => r.status === 'APPLIED')
          .map((r) => r.id)
      );
      const conflicts = pushJson.results.filter((r) => r.status === 'CONFLICT');

      for (const m of pending) {
        if (appliedIds.has(m.id)) {
          await db.outbox.delete(m.id);
        }
      }

      if (conflicts.length > 0) {
        notifyStatus('success');
        return {
          success: true,
          conflicts: conflicts.map((c) => ({
            id: c.id,
            conflictType: c.conflictType,
            conflictDetails: c.conflictDetails,
          })),
        };
      }
    }

    const pullUrl = `${API_BASE}/sync/pull?clinicId=${encodeURIComponent(clinicId)}${cursor ? `&since=${encodeURIComponent(cursor)}` : ''}`;
    const pullRes = await fetch(pullUrl, { headers });

    if (!pullRes.ok) {
      const errText = await pullRes.text();
      notifyStatus('error', errText);
      return { success: false, error: errText };
    }

    const pull = (await pullRes.json()) as SyncPullResponseDto;

    const toRecord = (r: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          v instanceof Date ? v.toISOString() : v,
        ])
      );

    for (const p of pull.patients) {
      await db.patients.put(toRecord(p) as unknown as Parameters<typeof db.patients.put>[0]);
    }
    for (const e of pull.encounters) {
      await db.encounters.put(toRecord(e) as unknown as Parameters<typeof db.encounters.put>[0]);
    }
    for (const v of pull.vitals) {
      await db.vitals.put(toRecord(v) as unknown as Parameters<typeof db.vitals.put>[0]);
    }
    for (const d of pull.diabetesScreenings) {
      await db.diabetes_screenings.put(toRecord(d) as unknown as Parameters<typeof db.diabetes_screenings.put>[0]);
    }
    for (const h of pull.hypertensionAssessments) {
      await db.hypertension_assessments.put(toRecord(h) as unknown as Parameters<typeof db.hypertension_assessments.put>[0]);
    }
    for (const c of pull.carePlans) {
      await db.care_plans.put(toRecord(c) as unknown as Parameters<typeof db.care_plans.put>[0]);
    }
    for (const pc of pull.patientConsents) {
      await db.patient_consents.put(toRecord(pc) as unknown as Parameters<typeof db.patient_consents.put>[0]);
    }
    if (pull.prescriptions) {
      for (const rx of pull.prescriptions) {
        await db.prescriptions.put(toRecord(rx) as unknown as Parameters<typeof db.prescriptions.put>[0]);
      }
    }

    await db.sync_state.put({
      clinicId,
      cursor: pull.cursor,
      updatedAt: new Date().toISOString(),
    });

    notifyStatus('success');
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notifyStatus('error', msg);
    return { success: false, error: msg };
  }
}
