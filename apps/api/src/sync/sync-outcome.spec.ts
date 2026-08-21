import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { classifySyncFailure, isTerminalOutcome, safeConflictDetails } from './sync-outcome';

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
      expect(classifySyncFailure(new NotFoundException('gone'), 'vitals').retryable).toBe(true);
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
