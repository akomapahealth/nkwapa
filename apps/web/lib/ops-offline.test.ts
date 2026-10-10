import type { OutboxRecord } from './db';
import type { ActiveShift, CheckInSummary } from './ops';
import {
  OPS_ENTITY,
  OPS_OFFLINE_SUPPORT,
  buildPatientCheckInMutation,
  buildShiftCheckInMutation,
  buildShiftCheckOutMutation,
  isOpsEntityType,
  opsIdempotencyKey,
  overlayPendingCheckIns,
  overlayPendingShifts,
  pendingOpsWrites,
} from './ops-offline';
import { buildOutboxMutation } from './outbox';

const actor = { clinicId: 'clinic-1', actorUserId: 'user-1', actorName: 'Ama Volunteer' };

/** An outbox row as the device would hold it after queueing `params`. */
function queued(
  params: ReturnType<typeof buildShiftCheckInMutation>,
  overrides: Partial<OutboxRecord> = {},
): OutboxRecord {
  return { ...buildOutboxMutation(params), ...overrides };
}

const serverShift = (overrides: Partial<ActiveShift> = {}): ActiveShift => ({
  shiftId: 'shift-server',
  userId: 'user-2',
  displayName: 'Kofi Doctor',
  roleAtShift: 'DOCTOR',
  checkedInAt: '2026-03-21T07:00:00.000Z',
  status: 'ACTIVE',
  ...overrides,
});

const serverCheckIn = (overrides: Partial<CheckInSummary> = {}): CheckInSummary => ({
  id: 'checkin-server',
  clinicId: 'clinic-1',
  patientId: 'patient-9',
  checkedInAt: '2026-03-21T08:00:00.000Z',
  source: 'STAFF',
  status: 'WAITING',
  encounterId: null,
  notes: null,
  patient: {
    id: 'patient-9',
    patientCode: 'NKP-9',
    firstName: 'Esi',
    lastName: 'Owusu',
    displayName: 'Esi Owusu',
  },
  assignmentSummary: null,
  ...overrides,
});

describe('ops offline payloads', () => {
  it('queues a shift start under its own id, with a key that names the action', () => {
    const params = buildShiftCheckInMutation({
      ...actor,
      shiftId: 'shift-1',
      roleAtShift: 'VOLUNTEER',
      occurredAt: '2026-03-21T08:15:00.000Z',
    });

    expect(params).toMatchObject({
      entityType: 'shift_check_in',
      entityId: 'shift-1',
      operation: 'UPSERT',
      idempotencyKey: 'ops:shift_check_in:shift-1',
      payloadJson: {
        schemaVersion: 1,
        roleAtShift: 'VOLUNTEER',
        occurredAt: '2026-03-21T08:15:00.000Z',
      },
    });
  });

  it('never sends a key the server would refuse', () => {
    // The server validates the payload with forbidNonWhitelisted, so an undefined `notes` must be
    // dropped and the display context must stay off the wire.
    const params = buildPatientCheckInMutation({
      ...actor,
      checkInId: 'checkin-1',
      patientId: 'patient-1',
      occurredAt: '2026-03-21T09:00:00.000Z',
      patient: { patientCode: 'NKP-1', displayName: 'Ama Mensah' },
    });

    expect(Object.keys(params.payloadJson).sort()).toEqual([
      'occurredAt',
      'patientId',
      'schemaVersion',
    ]);
    expect(params.localContext).toMatchObject({
      patientCode: 'NKP-1',
      patientName: 'Ama Mensah',
      actorUserId: 'user-1',
    });
  });

  it('ends a shift by naming it, so a queued start and end replay in order against one id', () => {
    const params = buildShiftCheckOutMutation({
      ...actor,
      shiftId: 'shift-1',
      occurredAt: '2026-03-21T12:00:00.000Z',
    });

    expect(params).toMatchObject({
      entityType: 'shift_check_out',
      entityId: 'shift-1',
      idempotencyKey: opsIdempotencyKey(OPS_ENTITY.SHIFT_CHECK_OUT, 'shift-1'),
    });
  });

  it('recognises only the clinic-operations entity types', () => {
    expect(isOpsEntityType('patient_check_in')).toBe(true);
    expect(isOpsEntityType('vitals')).toBe(false);
  });
});

describe('pendingOpsWrites', () => {
  it('reads the ops rows back with their state and device time, and ignores the rest', () => {
    const rows = [
      queued(
        buildShiftCheckInMutation({
          ...actor,
          shiftId: 'shift-1',
          roleAtShift: 'VOLUNTEER',
          occurredAt: '2026-03-21T08:15:00.000Z',
        }),
        { syncState: 'blocked' },
      ),
      {
        id: 'row-vitals',
        clinicId: 'clinic-1',
        entityType: 'vitals',
        entityId: 'vitals-1',
        operation: 'UPSERT',
        payloadJson: '{}',
        idempotencyKey: 'k',
        createdAt: '2026-03-21T08:00:00.000Z',
      },
    ];

    expect(pendingOpsWrites(rows)).toEqual([
      expect.objectContaining({
        entityType: 'shift_check_in',
        entityId: 'shift-1',
        state: 'blocked',
        occurredAt: '2026-03-21T08:15:00.000Z',
      }),
    ]);
  });
});

describe('overlayPendingShifts', () => {
  const me = { userId: 'user-1', displayName: 'Ama Volunteer' };
  const start = (overrides: Partial<OutboxRecord> = {}) =>
    queued(
      buildShiftCheckInMutation({
        ...actor,
        shiftId: 'shift-1',
        roleAtShift: 'VOLUNTEER',
        occurredAt: '2026-03-21T08:15:00.000Z',
      }),
      overrides,
    );

  it('adds a queued start of shift as pending', () => {
    const shifts = overlayPendingShifts([serverShift()], pendingOpsWrites([start()]), me);

    expect(shifts).toHaveLength(2);
    expect(shifts[1]).toMatchObject({
      shiftId: 'shift-1',
      userId: 'user-1',
      roleAtShift: 'VOLUNTEER',
      checkedInAt: '2026-03-21T08:15:00.000Z',
      pendingSync: 'pending',
    });
  });

  it('draws the server’s copy once it has it, never both', () => {
    const shifts = overlayPendingShifts(
      [serverShift({ shiftId: 'shift-1', userId: 'user-1' })],
      pendingOpsWrites([start()]),
      me,
    );

    expect(shifts).toHaveLength(1);
    expect(shifts[0].pendingSync).toBeUndefined();
  });

  it('keeps a shift being ended on the roster, marked as ending', () => {
    const end = queued(
      buildShiftCheckOutMutation({
        ...actor,
        shiftId: 'shift-server',
        occurredAt: '2026-03-21T12:00:00.000Z',
      }),
      { syncState: 'retrying' },
    );

    const [shift] = overlayPendingShifts([serverShift()], pendingOpsWrites([end]), me);

    expect(shift).toMatchObject({ shiftId: 'shift-server', pendingCheckOut: 'retrying' });
  });

  it('attributes a queued shift to whoever queued it, not whoever is signed in now', () => {
    const shifts = overlayPendingShifts([], pendingOpsWrites([start()]), {
      userId: 'user-7',
      displayName: 'Someone Else',
    });

    expect(shifts[0]).toMatchObject({ userId: 'user-1', displayName: 'Ama Volunteer' });
  });
});

describe('overlayPendingCheckIns', () => {
  const board = { clinicId: 'clinic-1', date: '2026-03-21', timezone: 'Africa/Accra' };
  const arrival = (occurredAt: string, checkInId = 'checkin-1') =>
    queued(
      buildPatientCheckInMutation({
        ...actor,
        checkInId,
        patientId: 'patient-1',
        occurredAt,
        patient: { patientCode: 'NKP-1', displayName: 'Ama Mensah' },
      }),
    );

  it('lists a queued arrival as waiting, named from the device’s copy, in arrival order', () => {
    const checkIns = overlayPendingCheckIns(
      [serverCheckIn()],
      pendingOpsWrites([arrival('2026-03-21T07:30:00.000Z')]),
      board,
    );

    expect(checkIns.map((checkIn) => checkIn.id)).toEqual(['checkin-1', 'checkin-server']);
    expect(checkIns[0]).toMatchObject({
      status: 'WAITING',
      pendingSync: 'pending',
      patient: { patientCode: 'NKP-1', displayName: 'Ama Mensah', firstName: 'Ama' },
    });
  });

  it('shows a queued arrival only on the clinic day it happened', () => {
    const checkIns = overlayPendingCheckIns(
      [],
      pendingOpsWrites([arrival('2026-03-20T23:59:00.000Z')]),
      board,
    );

    expect(checkIns).toEqual([]);
  });

  it('draws the server’s copy once it has it', () => {
    const checkIns = overlayPendingCheckIns(
      [serverCheckIn({ id: 'checkin-1' })],
      pendingOpsWrites([arrival('2026-03-21T07:30:00.000Z')]),
      board,
    );

    expect(checkIns).toHaveLength(1);
    expect(checkIns[0].pendingSync).toBeUndefined();
  });
});

describe('OPS_OFFLINE_SUPPORT', () => {
  it('queues only the actions the server replays idempotently', () => {
    const offline = Object.entries(OPS_OFFLINE_SUPPORT)
      .filter(([, support]) => support.offline)
      .map(([action]) => action)
      .sort();

    expect(offline).toEqual(['patientCheckIn', 'shiftCheckIn', 'shiftCheckOut']);
  });

  it('explains every action that is not available offline', () => {
    for (const support of Object.values(OPS_OFFLINE_SUPPORT)) {
      expect(support.offlineHint.length).toBeGreaterThan(20);
    }
  });
});
