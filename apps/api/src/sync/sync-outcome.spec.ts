import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DETERMINISTIC_SYNC_CONFLICT_CODES, SYNC_CONFLICT_CODES } from '@nkwapa/db';
import {
  DETERMINISTIC_CONFLICT_TYPES,
  classifySyncFailure,
  isTerminalOutcome,
  safeConflictDetails,
  syncRefusal,
} from './sync-outcome';

/**
 * Every literal code a module can put in front of a client: thrown `{ code }` bodies and the
 * refusals a handler builds itself.
 */
function emittedCodes(relativePath: string): string[] {
  const source = readFileSync(join(__dirname, '..', relativePath), 'utf8');
  const codes = new Set<string>();
  for (const pattern of [
    /code: '([A-Z][A-Z0-9_]+)'/g,
    /SYNC_MUTATION_RESULT_STATUS\.(?:CONFLICT|ERROR),\s*'([A-Z][A-Z0-9_]+)'/g,
  ]) {
    for (const match of source.matchAll(pattern)) codes.add(match[1]);
  }
  return [...codes].sort();
}

/** The modules an offline replay dispatches into. */
const SYNC_HANDLER_MODULES = [
  'sync/sync.service.ts',
  'sync/clinical-measurements.service.ts',
  'medical-history/medical-history.service.ts',
  'medication-reconciliation/medication-reconciliation.service.ts',
  'diabetes-screening/diabetes-screening.service.ts',
  'hypertension-assessment/hypertension-assessment.service.ts',
  'medication-adherence/medication-adherence.service.ts',
  'prescriptions/prescription.service.ts',
  'ops/ops.service.ts',
  'ops/ops-replay.ts',
];

describe('sync conflict code consistency', () => {
  it('caches exactly the codes the shared catalog calls deterministic', () => {
    expect([...DETERMINISTIC_CONFLICT_TYPES].sort()).toEqual(
      [...DETERMINISTIC_SYNC_CONFLICT_CODES].sort(),
    );
  });

  // A handler that starts throwing a new code must add it to the catalog, or the web app has no
  // plain-language message for it and the API no retry policy.
  it.each(SYNC_HANDLER_MODULES)('catalogs every code %s can report', (modulePath) => {
    const emitted = emittedCodes(modulePath);
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.filter((code) => !(code in SYNC_CONFLICT_CODES))).toEqual([]);
  });

  it.each([
    'APPLICATION_CONFLICT',
    'FORBIDDEN',
    'RECORD_NOT_FOUND',
    'APPLICATION_REJECTED',
    'APPLICATION_ERROR',
    'MEDICAL_HISTORY_CONFLICT',
  ])('catalogs the fallback code %s', (code) => {
    expect(code in SYNC_CONFLICT_CODES).toBe(true);
  });

  it('always states retryable on a refusal a handler builds itself', () => {
    expect(syncRefusal('m-1', 'CONFLICT', 'DUPLICATE_NATIONAL_ID', {}).retryable).toBe(false);
    expect(syncRefusal('m-1', 'ERROR', 'DELETE_NOT_SUPPORTED', {}).retryable).toBe(false);
    expect(syncRefusal('m-1', 'ERROR', 'FORBIDDEN', {}).retryable).toBe(true);
  });
});

describe('sync failure classification', () => {
  describe('what a replay may skip', () => {
    it('skips a mutation that already applied', () => {
      expect(isTerminalOutcome('APPLIED', null)).toBe(true);
    });

    it('skips a conflict that server state cannot resolve', () => {
      expect(isTerminalOutcome('CONFLICT', 'CONFLICT_FINALIZED')).toBe(true);
      expect(isTerminalOutcome('CONFLICT', 'DUPLICATE_NATIONAL_ID')).toBe(true);
      expect(isTerminalOutcome('CONFLICT', 'MEDICAL_HISTORY_CONFLICT')).toBe(true);
    });

    it('re-attempts anything that a later change could resolve', () => {
      // The poisoned-outbox mechanism: caching these made a client's queue undrainable even after
      // the payload, the permission, or the server was fixed.
      expect(isTerminalOutcome('ERROR', 'FORBIDDEN')).toBe(false);
      expect(isTerminalOutcome('ERROR', 'APPLICATION_ERROR')).toBe(false);
      expect(isTerminalOutcome('ERROR', 'VALIDATION_ERROR')).toBe(false);
      expect(isTerminalOutcome('CONFLICT', 'APPLICATION_CONFLICT')).toBe(false);
      expect(isTerminalOutcome('CONFLICT', null)).toBe(false);
    });
  });

  describe('classification', () => {
    it('labels a permission denial as retryable, because a role grant resolves it', () => {
      const outcome = classifySyncFailure(new ForbiddenException('nope'), 'care_plan');
      expect(outcome.status).toBe('ERROR');
      expect(outcome.conflictType).toBe('FORBIDDEN');
      expect(outcome.retryable).toBe(true);
    });

    it('labels a finalized encounter as a conflict that will not change', () => {
      const outcome = classifySyncFailure(
        new ConflictException({ code: 'CONFLICT_FINALIZED', message: 'locked' }),
        'care_plan',
      );
      expect(outcome.status).toBe('CONFLICT');
      expect(outcome.conflictType).toBe('CONFLICT_FINALIZED');
      expect(outcome.retryable).toBe(false);
    });

    it('keeps a missing reference retryable, since a later pull may supply it', () => {
      const outcome = classifySyncFailure(new NotFoundException('gone'), 'vitals');
      expect(outcome.conflictType).toBe('RECORD_NOT_FOUND');
      expect(outcome.retryable).toBe(true);
    });

    it('does not re-send content the server refuses, since the payload cannot change', () => {
      const outcome = classifySyncFailure(
        new BadRequestException({ code: 'VALIDATION_ERROR', message: 'bad' }),
        'vitals',
      );
      expect(outcome.status).toBe('ERROR');
      expect(outcome.retryable).toBe(false);
    });

    it('points a merged chart at its survivor without leaking anything else', () => {
      const outcome = classifySyncFailure(
        new ConflictException({
          code: 'PATIENT_MERGED',
          message: 'merged',
          canonicalPatientId: 'canonical-1',
          patientCode: 'NKP-1',
        }),
        'encounter',
      );
      expect(outcome).toMatchObject({
        status: 'CONFLICT',
        retryable: false,
        conflictDetails: { canonicalPatientId: 'canonical-1', patientCode: 'NKP-1' },
      });
    });

    it('keeps an unexpected failure retryable', () => {
      const outcome = classifySyncFailure(new Error('connection reset'), 'vitals');
      expect(outcome.conflictType).toBe('APPLICATION_ERROR');
      expect(outcome.retryable).toBe(true);
    });

    it('names a medical history revision conflict even without a code', () => {
      const outcome = classifySyncFailure(
        new ConflictException('stale revision'),
        'medical_history_revision',
      );
      expect(outcome.conflictType).toBe('MEDICAL_HISTORY_CONFLICT');
      expect(outcome.retryable).toBe(false);
    });
  });

  describe('what the client is told', () => {
    it('carries the fields a client needs to recover', () => {
      const details = safeConflictDetails(
        {
          code: 'MEDICAL_HISTORY_CONFLICT',
          message: 'Revision is stale',
          currentRevisionId: 'rev-9',
          existingStatus: 'FINALIZED',
        },
        'fallback',
      );
      expect(details).toMatchObject({
        code: 'MEDICAL_HISTORY_CONFLICT',
        message: 'Revision is stale',
        currentRevisionId: 'rev-9',
        existingStatus: 'FINALIZED',
      });
    });

    it('names the existing shift or check-in an ops conflict collided with, and nothing else', () => {
      const details = safeConflictDetails(
        {
          code: 'SHIFT_ALREADY_ACTIVE',
          message: 'User already has an active shift in this clinic',
          existingShiftId: 'shift-1',
          existingCheckInId: 'checkin-1',
          existingShift: { id: 'shift-1', notes: 'free text' },
        },
        'fallback',
      );
      expect(details).toMatchObject({ existingShiftId: 'shift-1', existingCheckInId: 'checkin-1' });
      expect(details).not.toHaveProperty('existingShift');
    });

    it('drops anything not on the allow-list', () => {
      // The raw exception response used to be echoed verbatim and persisted. A handler that began
      // including patient detail in its response would have leaked it without touching sync code.
      const details = safeConflictDetails(
        {
          code: 'X',
          message: 'nope',
          patientName: 'Ama Mensah',
          dob: '1970-01-01',
          nationalId: 'GHA-123456789-0',
        },
        'fallback',
      );
      expect(details).not.toHaveProperty('patientName');
      expect(details).not.toHaveProperty('dob');
      expect(details).not.toHaveProperty('nationalId');
    });

    it('redacts contact details that reach the message', () => {
      const details = safeConflictDetails(
        { message: 'Duplicate for ama@example.com on +233200000001' },
        'fallback',
      );
      expect(details.message).not.toContain('ama@example.com');
      expect(details.message).not.toContain('233200000001');
    });

    it('bounds field errors and redacts each one', () => {
      const details = safeConflictDetails(
        {
          fieldErrors: Array.from({ length: 50 }, (_, i) => ({
            field: `f${i}`,
            message: 'contact ama@example.com',
          })),
        },
        'fallback',
      );
      expect(details.fieldErrors).toHaveLength(20);
      expect(JSON.stringify(details.fieldErrors)).not.toContain('ama@example.com');
    });

    it('falls back to the error message when there is no structured response', () => {
      expect(safeConflictDetails(null, 'something went wrong').message).toBe(
        'something went wrong',
      );
    });
  });
});
