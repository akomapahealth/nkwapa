import { SYNC_CONFLICT_CODES, type SyncConflictCode } from '@nkwapa/db/sync-conflicts';
import type { OutboxRecord } from './db';
import {
  describeSyncFailure,
  describeSyncTransportFailure,
  outboxEncounterId,
  outboxPatientId,
  syncEntityLabel,
  syncRecoveryActionLabel,
} from './sync-conflicts';

const context = { clinicId: 'clinic-1', canReviewDuplicates: true };

function row(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    id: 'mutation-1',
    clinicId: 'clinic-1',
    entityType: 'patient',
    entityId: 'patient-1',
    operation: 'UPSERT',
    payloadJson: JSON.stringify({ firstName: 'Ama' }),
    idempotencyKey: 'key-1',
    createdAt: '2026-09-20T10:00:00.000Z',
    syncState: 'blocked',
    ...overrides,
  };
}

function failed(
  conflictType: string,
  conflictDetails: Record<string, unknown> = {},
  overrides: Partial<OutboxRecord> = {},
  status = 'CONFLICT',
) {
  return row({
    lastFailure: { status, conflictType, conflictDetails, retryable: false, at: 'now' },
    ...overrides,
  });
}

describe('describeSyncFailure', () => {
  describe('duplicate patient', () => {
    const duplicate = failed('DUPLICATE_NATIONAL_ID', {
      existingPatientId: 'existing-1',
      patientCode: 'NKP-1',
    });

    it('explains the duplicate in plain language and points at the existing chart', () => {
      const description = describeSyncFailure(duplicate, context);

      expect(description.title).toBe('Another chart already uses this national ID');
      expect(description.nextStep).toMatch(/Open the existing chart/);
      expect(description.canonicalPatientHref).toBe('/clinics/clinic-1/patients/existing-1');
      expect(description.actions[0]).toBe('open-canonical-patient');
    });

    it('offers duplicate review only to someone who can review duplicates', () => {
      expect(describeSyncFailure(duplicate, context).actions).toContain('review-duplicates');
      const withoutPermission = describeSyncFailure(duplicate, {
        ...context,
        canReviewDuplicates: false,
      });
      expect(withoutPermission.actions).not.toContain('review-duplicates');
      expect(withoutPermission.duplicatesHref).toBeUndefined();
    });

    it('does not offer a retry that would come back the same', () => {
      expect(describeSyncFailure(duplicate, context).actions).not.toContain('retry');
    });

    it('never merges anything itself: the only write it offers is discarding the local copy', () => {
      const writes = describeSyncFailure(duplicate, context).actions.filter(
        (action) => !action.startsWith('open') && action !== 'review-duplicates',
      );
      expect(writes).toEqual(['discard']);
    });
  });

  describe('merged chart', () => {
    const merged = failed(
      'PATIENT_MERGED',
      { canonicalPatientId: 'canonical-1', patientCode: 'NKP-2' },
      { entityType: 'encounter', entityId: 'enc-1', payloadJson: '{"patientId":"retired-1"}' },
    );

    it('links the surviving chart and withholds the retired one', () => {
      const description = describeSyncFailure(merged, context);

      expect(description.title).toBe('This chart was merged into another chart');
      expect(description.canonicalPatientHref).toBe('/clinics/clinic-1/patients/canonical-1');
      expect(description.patientHref).toBeUndefined();
      expect(description.actions).toEqual(['open-canonical-patient', 'discard']);
      expect(description.actionLabels['open-canonical-patient']).toBe('Open current chart');
    });
  });

  it('sends a locked-visit conflict to the visit', () => {
    const description = describeSyncFailure(
      failed(
        'CONFLICT_FINALIZED',
        {},
        {
          entityType: 'encounter_vitals_bundle',
          payloadJson: JSON.stringify({ encounterId: 'enc-9', patientId: 'patient-9' }),
        },
      ),
      context,
    );

    expect(description.category).toBe('locked');
    expect(description.encounterHref).toBe('/encounters/enc-9');
    expect(description.actions).toEqual(['open-encounter', 'open-patient', 'discard']);
  });

  it('shows the server’s own reason for a validation refusal', () => {
    const description = describeSyncFailure(
      failed(
        'VALIDATION_ERROR',
        { fieldErrors: [{ field: 'x', message: 'Temperature unit is required' }] },
        {},
        'ERROR',
      ),
      context,
    );

    expect(description.category).toBe('validation');
    expect(description.serverDetail).toBe('Temperature unit is required');
    expect(description.actions).toEqual(['open-patient', 'retry', 'discard']);
  });

  it('offers retry on a change that is already being retried', () => {
    const description = describeSyncFailure(
      failed('FORBIDDEN', {}, { syncState: 'retrying' }, 'ERROR'),
      context,
    );

    expect(description.actions[0]).toBe('retry');
    expect(description.tone).toBe('warning');
  });

  it('does not link a refused new chart, only the one that already exists', () => {
    const description = describeSyncFailure(
      failed('DUPLICATE_NATIONAL_ID', { existingPatientId: 'existing-1' }, { entityId: 'new-1' }),
      context,
    );
    expect(description.patientHref).toBeUndefined();
    expect(description.actions).toEqual(['open-canonical-patient', 'review-duplicates', 'discard']);
  });

  it('has nothing to open for a new chart that never reached the server', () => {
    const description = describeSyncFailure(
      failed('PATIENT_NATIONAL_ID_REQUIRED', {}, {}, 'ERROR'),
      context,
    );
    expect(description.actions).toEqual(['retry', 'discard']);
  });

  it('uses the patient the caller resolved when the change only names a visit', () => {
    const description = describeSyncFailure(
      failed(
        'STALE_MEDICAL_HISTORY_REVISION',
        {},
        {
          entityType: 'care_plan',
          payloadJson: '{"encounterId":"enc-1"}',
        },
      ),
      { ...context, patientId: 'patient-7' },
    );
    expect(description.patientHref).toBe('/clinics/clinic-1/patients/patient-7');
  });

  it('still says something useful about a code this build has never seen', () => {
    const conflict = describeSyncFailure(failed('BRAND_NEW_CODE'), context);
    expect(conflict.category).toBe('stale');
    expect(conflict.title).toBeTruthy();

    const error = describeSyncFailure(failed('BRAND_NEW_CODE', {}, {}, 'ERROR'), context);
    expect(error.category).toBe('unexpected');
  });

  it.each(Object.keys(SYNC_CONFLICT_CODES) as SyncConflictCode[])(
    'words %s without exposing the code',
    (code) => {
      const description = describeSyncFailure(failed(code), context);
      for (const text of [description.title, description.explanation, description.nextStep]) {
        expect(text.length).toBeGreaterThan(10);
        expect(text).not.toContain(code);
        expect(text).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      }
      expect(description.actions.at(-1)).toBe('discard');
    },
  );

  it('keeps every chart link inside the active clinic and escapes ids', () => {
    const description = describeSyncFailure(
      failed('DUPLICATE_NATIONAL_ID', { existingPatientId: '../admin' }),
      context,
    );
    expect(description.canonicalPatientHref).toBe('/clinics/clinic-1/patients/..%2Fadmin');
  });
});

describe('outbox helpers', () => {
  it('finds the patient and visit a change belongs to', () => {
    expect(outboxPatientId(row())).toBe('patient-1');
    expect(outboxPatientId(row({ entityType: 'vitals', payloadJson: '{"patientId":"p-2"}' }))).toBe(
      'p-2',
    );
    expect(outboxEncounterId(row({ entityType: 'encounter', entityId: 'e-1' }))).toBe('e-1');
    expect(outboxPatientId(row({ entityType: 'vitals', payloadJson: 'not json' }))).toBeUndefined();
  });

  it('names every kind of change in product words', () => {
    expect(syncEntityLabel('encounter_vitals_bundle')).toBe('Vital signs');
    expect(syncEntityLabel('something_new')).toBe('Offline change');
    expect(syncRecoveryActionLabel('open-canonical-patient')).toBe('Open existing chart');
  });
});

describe('describeSyncTransportFailure', () => {
  it.each([
    [null, undefined, /Could not reach the server/],
    [401, undefined, /session has expired/],
    [403, undefined, /cannot sync at this clinic/],
    [429, undefined, /paused for a minute/],
    [400, '{"code":"VALIDATION_ERROR"}', /Refresh the page/],
    [503, 'Service Unavailable', /server had a problem/],
    [418, undefined, /Sync did not finish/],
  ])('describes status %s', (status, body, pattern) => {
    const failure = describeSyncTransportFailure(status, body);
    expect(failure.message).toMatch(pattern);
    expect(failure.message).toMatch(/saved on this device/);
  });

  it('keeps the raw body for support, bounded', () => {
    const failure = describeSyncTransportFailure(500, 'x'.repeat(5000));
    expect(failure.detail).toHaveLength(2000);
  });
});
