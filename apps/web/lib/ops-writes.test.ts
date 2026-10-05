import { ApiError } from './api';
import type { OutboxMutationParams } from './outbox';
import { submitOpsWrite, type OpsWriteDeps } from './ops-writes';

jest.mock('./db', () => ({ db: jest.requireActual('./testing/fake-sync-db').createFakeSyncDb() }));

const NOW = new Date('2026-03-21T08:15:00.000Z');

function deps(overrides: Partial<OpsWriteDeps> = {}) {
  const enqueued: OutboxMutationParams[] = [];
  const send = jest.fn();
  return {
    enqueued,
    send,
    deps: {
      clinicId: 'clinic-1',
      getToken: async () => 'token',
      isOnline: true,
      actor: { userId: 'user-1', displayName: 'Ama Volunteer' },
      send,
      enqueue: async (params: OutboxMutationParams) => {
        enqueued.push(params);
      },
      now: () => NOW,
      ...overrides,
    } satisfies OpsWriteDeps,
  };
}

const ok = () => new Response('{}', { status: 200 });

describe('submitOpsWrite', () => {
  it('sends an online shift start to its REST route under the device’s id', async () => {
    const { deps: d, send, enqueued } = deps();
    send.mockResolvedValue(ok());

    const result = await submitOpsWrite(
      { kind: 'shiftCheckIn', shiftId: 'shift-1', roleAtShift: 'VOLUNTEER' },
      d,
    );

    expect(result).toEqual({ outcome: 'applied' });
    expect(send).toHaveBeenCalledWith(
      '/clinics/clinic-1/shifts/check-in',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'shift-1', roleAtShift: 'VOLUNTEER' }),
        activeClinicId: 'clinic-1',
      }),
    );
    expect(enqueued).toEqual([]);
  });

  it('queues straight away while offline, recording when the person acted', async () => {
    const { deps: d, send, enqueued } = deps({ isOnline: false });

    const result = await submitOpsWrite(
      {
        kind: 'patientCheckIn',
        checkInId: 'checkin-1',
        patientId: 'patient-1',
        patient: { patientCode: 'NKP-1', displayName: 'Ama Mensah' },
      },
      d,
    );

    expect(result).toEqual({ outcome: 'queued' });
    expect(send).not.toHaveBeenCalled();
    expect(enqueued).toEqual([
      expect.objectContaining({
        entityType: 'patient_check_in',
        entityId: 'checkin-1',
        idempotencyKey: 'ops:patient_check_in:checkin-1',
        payloadJson: expect.objectContaining({ occurredAt: NOW.toISOString() }),
        localContext: expect.objectContaining({ patientName: 'Ama Mensah' }),
      }),
    ]);
  });

  it.each(['NETWORK_ERROR', 'REQUEST_TIMEOUT'])(
    'queues under the same id when the request gets no answer (%s)',
    async (code) => {
      const { deps: d, send, enqueued } = deps();
      send.mockRejectedValue(new ApiError('unreachable', { code, retryable: true }));

      const result = await submitOpsWrite(
        { kind: 'patientCheckIn', checkInId: 'checkin-1', patientId: 'patient-1' },
        d,
      );

      // If the request did land, the replay finds checkin-1 and applies nothing new.
      expect(result).toEqual({ outcome: 'queued' });
      expect(JSON.parse(send.mock.calls[0][1].body)).toMatchObject({ id: 'checkin-1' });
      expect(enqueued[0]).toMatchObject({ entityId: 'checkin-1' });
    },
  );

  it('reports a refusal instead of queueing it, because a replay would be refused too', async () => {
    const { deps: d, send, enqueued } = deps();
    send.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'PATIENT_ALREADY_CHECKED_IN',
          message: 'This patient is already checked in today.',
        }),
        { status: 409 },
      ),
    );

    const result = await submitOpsWrite(
      { kind: 'patientCheckIn', checkInId: 'checkin-1', patientId: 'patient-1' },
      d,
    );

    expect(result).toMatchObject({
      outcome: 'refused',
      error: expect.objectContaining({ code: 'PATIENT_ALREADY_CHECKED_IN', status: 409 }),
    });
    expect(enqueued).toEqual([]);
  });

  it('queues the end of a shift whose start is still queued, even online', async () => {
    const { deps: d, send, enqueued } = deps();

    const result = await submitOpsWrite(
      { kind: 'shiftCheckOut', shiftId: 'shift-1', afterQueuedStart: true },
      d,
    );

    expect(result).toEqual({ outcome: 'queued' });
    expect(send).not.toHaveBeenCalled();
    expect(enqueued[0]).toMatchObject({ entityType: 'shift_check_out', entityId: 'shift-1' });
  });

  it('lets an unexpected failure surface rather than hiding it in the queue', async () => {
    const { deps: d, send, enqueued } = deps();
    send.mockRejectedValue(new TypeError('bug'));

    await expect(submitOpsWrite({ kind: 'shiftCheckOut', shiftId: 'shift-1' }, d)).rejects.toThrow(
      'bug',
    );
    expect(enqueued).toEqual([]);
  });
});
