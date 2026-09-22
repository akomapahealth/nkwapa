import { ApiError } from '@/lib/api';
import { mayQueueAfterFailure, mapServerFieldErrors } from '@/lib/prescription-save';

describe('mayQueueAfterFailure', () => {
  // The defect this guards: a refused prescription was written to Dexie, queued, and
  // reported to the prescriber as saved. It could only ever be refused again on replay.
  it.each([400, 401, 403, 404, 409, 422, 500])(
    'refuses to queue a response the server actually sent (%i)',
    (status) => {
      expect(mayQueueAfterFailure(new ApiError('Refused', { status }))).toBe(false);
    },
  );

  it.each([
    ['NETWORK_ERROR', "We couldn't reach the server."],
    ['REQUEST_TIMEOUT', 'The request took too long to complete.'],
  ])('queues when nothing came back (%s)', (code, message) => {
    // apiFetch raises these two with no status, which is the whole signal.
    expect(mayQueueAfterFailure(new ApiError(message, { code, retryable: true }))).toBe(true);
  });

  it('queues a plain transport error that never reached apiFetch error handling', () => {
    expect(mayQueueAfterFailure(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('treats a non-Error throwable as offline rather than dropping the prescription', () => {
    // Losing a prescription is worse than queueing one that will be refused once.
    expect(mayQueueAfterFailure('something odd')).toBe(true);
    expect(mayQueueAfterFailure(undefined)).toBe(true);
  });

  it('keys off the status, not the retryable flag', () => {
    // A 500 is retryable, but the server still answered, so the outbox is not the place
    // for it - a retry belongs to the prescriber, who is online and can see the error.
    const serverError = new ApiError('Upstream failed', { status: 500, retryable: true });
    expect(mayQueueAfterFailure(serverError)).toBe(false);
  });
});

describe('mapServerFieldErrors', () => {
  const fieldToInput = {
    drugId: 'prescription-drug-search',
    dosage: 'prescription-dosage',
    quantity: 'prescription-quantity',
  };

  it('moves a server field error onto the input that renders it', () => {
    expect(
      mapServerFieldErrors(
        [{ field: 'quantity', message: 'must not be less than 1' }],
        fieldToInput,
      ),
    ).toEqual({ 'prescription-quantity': 'must not be less than 1' });
  });

  it('drops fields this form does not render rather than losing them on screen', () => {
    // An error pinned to an invisible input is an error the prescriber never sees. These
    // stay in the banner instead.
    expect(
      mapServerFieldErrors([{ field: 'encounterId', message: 'must be a UUID' }], fieldToInput),
    ).toEqual({});
  });

  it('keeps the first message when the server reports a field twice', () => {
    expect(
      mapServerFieldErrors(
        [
          { field: 'dosage', message: 'should not be empty' },
          { field: 'dosage', message: 'must be shorter than 120 characters' },
        ],
        fieldToInput,
      ),
    ).toEqual({ 'prescription-dosage': 'should not be empty' });
  });

  it('returns nothing for an empty list, so the banner stands alone', () => {
    expect(mapServerFieldErrors([], fieldToInput)).toEqual({});
  });
});
