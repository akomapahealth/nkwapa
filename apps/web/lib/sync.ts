'use client';

import { db } from './db';
import type { SyncPullResponseDto } from './sync-types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/**
 * `retrying` means the pass completed but some changes stayed queued because the server said they
 * could still succeed later. It is deliberately distinct from `error`: nothing needs the
 * clinician's attention, and the pass did not stop.
 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'retrying' | 'error';

export type SyncStatusListener = (status: SyncStatus, error?: string) => void;

const listeners: Set<SyncStatusListener> = new Set();
const inFlightByClinic = new Map<string, Promise<SyncResult>>();
const rerunRequestedByClinic = new Set<string>();

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

export interface SyncResult {
  success: boolean;
  error?: string;
  conflicts?: Array<{
    id: string;
    conflictType?: string;
    conflictDetails?: Record<string, unknown>;
  }>;
  /** Mutations the server refused outright, e.g. a payload it will never accept. */
  rejected?: Array<{
    id: string;
    conflictType?: string;
    conflictDetails?: Record<string, unknown>;
  }>;
}

async function performSync(options: SyncNowOptions): Promise<SyncResult> {
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
        },
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
          retryable?: boolean;
        }>;
      };

      const appliedIds = new Set(
        pushJson.results.filter((r) => r.status === 'APPLIED').map((r) => r.id),
      );
      const conflicts = pushJson.results.filter((r) => r.status === 'CONFLICT');

      // A failure the server says could still succeed -- a permission not yet granted, a
      // referenced record that has not arrived, a transient error. The row stays queued and the
      // pass continues, so one such change cannot hold back everything behind it or block the
      // inbound half of the sync.
      const retryable = pushJson.results.filter(
        (r) => r.status !== 'APPLIED' && r.status !== 'CONFLICT' && r.retryable === true,
      );

      // A failure that replaying will not resolve. The row is deliberately kept so a clinician's
      // entry is never silently discarded, but it must be surfaced: these were once invisible and
      // re-pushed forever, leaving a pending counter that never cleared.
      const rejected = pushJson.results.filter(
        (r) => r.status !== 'APPLIED' && r.status !== 'CONFLICT' && r.retryable !== true,
      );

      for (const m of pending) {
        if (appliedIds.has(m.id)) {
          await db.outbox.delete(m.id);
        }
      }

      if (rejected.length > 0) {
        const detail =
          rejected
            .map((r) => {
              const fieldErrors = (
                r.conflictDetails as { fieldErrors?: Array<{ message?: string }> } | undefined
              )?.fieldErrors;
              return fieldErrors?.[0]?.message ?? r.conflictType;
            })
            .find((message): message is string => Boolean(message)) ?? 'Unknown validation error';
        const message =
          rejected.length === 1
            ? `A pending change could not be synced: ${detail}`
            : `${rejected.length} pending changes could not be synced: ${detail}`;
        notifyStatus('error', message);
        return {
          success: false,
          error: message,
          rejected: rejected.map((r) => ({
            id: r.id,
            conflictType: r.conflictType,
            conflictDetails: r.conflictDetails,
          })),
        };
      }

      if (retryable.length > 0) {
        notifyStatus(
          'retrying',
          retryable.length === 1
            ? 'A pending change will be retried.'
            : `${retryable.length} pending changes will be retried.`,
        );
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
        Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
      );

    for (const p of pull.patients) {
      await db.patients.put(toRecord(p) as unknown as Parameters<typeof db.patients.put>[0]);
    }
    for (const e of pull.encounters) {
      await db.encounters.put(toRecord(e) as unknown as Parameters<typeof db.encounters.put>[0]);
    }
    for (const v of pull.vitals) {
      const record = toRecord(v);
      if (record.pulseBpm == null && record.heartRate != null) record.pulseBpm = record.heartRate;
      delete record.heartRate;
      await db.vitals.put(record as unknown as Parameters<typeof db.vitals.put>[0]);
    }
    for (const tobacco of pull.tobaccoScreenings ?? []) {
      await db.tobacco_screenings.put(
        toRecord(tobacco) as unknown as Parameters<typeof db.tobacco_screenings.put>[0],
      );
    }
    for (const d of pull.diabetesScreenings) {
      await db.diabetes_screenings.put(
        toRecord(d) as unknown as Parameters<typeof db.diabetes_screenings.put>[0],
      );
    }
    for (const h of pull.hypertensionAssessments) {
      await db.hypertension_assessments.put(
        toRecord(h) as unknown as Parameters<typeof db.hypertension_assessments.put>[0],
      );
    }
    for (const c of pull.carePlans) {
      await db.care_plans.put(toRecord(c) as unknown as Parameters<typeof db.care_plans.put>[0]);
    }
    for (const pc of pull.patientConsents) {
      await db.patient_consents.put(
        toRecord(pc) as unknown as Parameters<typeof db.patient_consents.put>[0],
      );
    }
    if (pull.prescriptions) {
      for (const rx of pull.prescriptions) {
        await db.prescriptions.put(
          toRecord(rx) as unknown as Parameters<typeof db.prescriptions.put>[0],
        );
      }
    }
    if (pull.medicalHistoryRecords) {
      for (const historyRecord of pull.medicalHistoryRecords) {
        await db.medical_history_records.put(
          toRecord(historyRecord) as unknown as Parameters<
            typeof db.medical_history_records.put
          >[0],
        );
      }
    }
    if (pull.medicalHistoryRevisions) {
      for (const historyRevision of pull.medicalHistoryRevisions) {
        await db.medical_history_revisions.put(
          toRecord(historyRevision) as unknown as Parameters<
            typeof db.medical_history_revisions.put
          >[0],
        );
      }
    }
    for (const record of pull.patientMedicationRecords ?? []) {
      await db.patient_medication_records.put(
        toRecord(record) as unknown as Parameters<typeof db.patient_medication_records.put>[0],
      );
    }
    for (const revision of pull.patientMedicationRevisions ?? []) {
      await db.patient_medication_revisions.put(
        toRecord(revision) as unknown as Parameters<typeof db.patient_medication_revisions.put>[0],
      );
    }
    for (const event of pull.medicationReconciliationEvents ?? []) {
      await db.medication_reconciliation_events.put(
        toRecord(event) as unknown as Parameters<typeof db.medication_reconciliation_events.put>[0],
      );
    }
    for (const record of pull.patientPharmacyRecords ?? []) {
      await db.patient_pharmacy_records.put(
        toRecord(record) as unknown as Parameters<typeof db.patient_pharmacy_records.put>[0],
      );
    }
    for (const revision of pull.patientPharmacyRevisions ?? []) {
      await db.patient_pharmacy_revisions.put(
        toRecord(revision) as unknown as Parameters<typeof db.patient_pharmacy_revisions.put>[0],
      );
    }
    for (const preference of pull.patientPharmacyPreferences ?? []) {
      await db.patient_pharmacy_preferences.put(
        toRecord(preference) as unknown as Parameters<
          typeof db.patient_pharmacy_preferences.put
        >[0],
      );
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

/**
 * Coalesces concurrent retries without losing mutations queued during an active sync pass.
 * A concurrent caller requests one follow-up pass after the current push/pull completes.
 */
export function syncNow(options: SyncNowOptions): Promise<SyncResult> {
  const inFlight = inFlightByClinic.get(options.clinicId);
  if (inFlight) {
    rerunRequestedByClinic.add(options.clinicId);
    return inFlight;
  }

  const request = (async () => {
    const conflicts: NonNullable<SyncResult['conflicts']> = [];
    let result: SyncResult;

    do {
      rerunRequestedByClinic.delete(options.clinicId);
      result = await performSync(options);
      if (result.conflicts) conflicts.push(...result.conflicts);
    } while (result.success && rerunRequestedByClinic.has(options.clinicId));

    return conflicts.length ? { ...result, conflicts } : result;
  })().finally(() => {
    rerunRequestedByClinic.delete(options.clinicId);
    if (inFlightByClinic.get(options.clinicId) === request) {
      inFlightByClinic.delete(options.clinicId);
    }
  });
  inFlightByClinic.set(options.clinicId, request);
  return request;
}
