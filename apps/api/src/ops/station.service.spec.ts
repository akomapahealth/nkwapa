import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StationService } from './station.service';

const CLINIC = 'clinic-1';
const STATIONS = [
  { id: 'st-intake', clinicId: CLINIC, kind: 'INTAKE', name: 'Intake', sortOrder: 1, active: true },
  { id: 'st-bp', clinicId: CLINIC, kind: 'BLOOD_PRESSURE', name: 'BP', sortOrder: 2, active: true },
  {
    id: 'st-glucose',
    clinicId: CLINIC,
    kind: 'GLUCOSE',
    name: 'Glucose',
    sortOrder: 3,
    active: true,
  },
  {
    id: 'st-anthro',
    clinicId: CLINIC,
    kind: 'ANTHROPOMETRY',
    name: 'Anthropometry',
    sortOrder: 4,
    active: true,
  },
  { id: 'st-review', clinicId: CLINIC, kind: 'REVIEW', name: 'Review', sortOrder: 5, active: true },
];

const volunteer = { userId: 'vol-1', canManage: false };
const otherVolunteer = { userId: 'vol-2', canManage: false };
const manager = { userId: 'mgr-1', canManage: true };

type Row = Record<string, unknown>;

function visitRow(overrides: Row = {}): Row {
  const stationId = (overrides.stationId as string) ?? 'st-bp';
  return {
    id: 'visit-1',
    clinicId: CLINIC,
    patientCheckInId: 'checkin-1',
    encounterId: 'enc-1',
    stationId,
    status: 'QUEUED',
    queuedAt: new Date('2026-10-07T09:00:00Z'),
    queuedByUserId: 'vol-0',
    claimedByUserId: null,
    claimedAt: null,
    assignedByUserId: null,
    completedByUserId: null,
    completedAt: null,
    handoffNote: null,
    endReason: null,
    releaseCount: 0,
    ...overrides,
    station: STATIONS.find((s) => s.id === stationId),
    claimedBy: overrides.claimedByUserId
      ? { id: overrides.claimedByUserId, displayName: `Name ${overrides.claimedByUserId}` }
      : null,
    assignedBy: overrides.assignedByUserId
      ? { id: overrides.assignedByUserId, displayName: `Name ${overrides.assignedByUserId}` }
      : null,
    completedBy: null,
    patientCheckIn: {
      id: 'checkin-1',
      status: 'IN_PROGRESS',
      checkedInAt: new Date('2026-10-07T08:55:00Z'),
      encounterId: 'enc-1',
      patient: {
        id: 'patient-1',
        patientCode: 'NKP-2026-000001',
        firstName: 'Ama',
        lastName: 'Mensah',
        dob: null,
      },
    },
  };
}

/**
 * A small in-memory stand-in for the visit table: enough state to show that a conditional update
 * on status lets exactly one of two claims through.
 */
function setup(initial: Row = {}) {
  let visit = visitRow(initial);
  const created: Row[] = [];
  const tx = {
    patientStationVisit: {
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const statusOk = !where.status || where.status === visit.status;
        const claimOk =
          !('claimedByUserId' in where) || where.claimedByUserId === visit.claimedByUserId;
        const clinicOk = !where.clinicId || where.clinicId === visit.clinicId;
        if (where.id !== visit.id || !statusOk || !claimOk || !clinicOk) return { count: 0 };
        const next: Row = { ...visit };
        for (const [key, value] of Object.entries(data)) {
          next[key] =
            value && typeof value === 'object' && 'increment' in (value as Row)
              ? (visit[key] as number) + ((value as { increment: number }).increment ?? 0)
              : value;
        }
        visit = visitRow(next);
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => visit),
      findUniqueOrThrow: jest.fn(async () => visit),
      findFirst: jest.fn(async () =>
        ['QUEUED', 'IN_PROGRESS'].includes(visit.status as string) ? visit : null,
      ),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: { data: Row }) => {
        visit = visitRow({ ...visit, ...data });
        return visit;
      }),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { id: `visit-new-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
      count: jest.fn(async () => 0),
    },
    patientCheckIn: {
      findUnique: jest.fn(async () => ({
        id: 'checkin-1',
        clinicId: CLINIC,
        patientId: 'patient-1',
        status: 'IN_PROGRESS',
        encounterId: 'enc-1',
      })),
      findUniqueOrThrow: jest.fn(async () => ({
        id: 'checkin-1',
        clinicId: CLINIC,
        patientId: 'patient-1',
        status: 'IN_PROGRESS',
        encounterId: 'enc-1',
      })),
      update: jest.fn(async ({ data }: { data: Row }) => ({ id: 'checkin-1', ...data })),
    },
    clinicStation: {
      findMany: jest.fn(async () => STATIONS),
      findFirst: jest.fn(async () => STATIONS[0]),
      create: jest.fn(async ({ data }: { data: Row }) => ({ id: 'st-new', active: true, ...data })),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) => ({
        ...STATIONS.find((s) => s.id === where.id),
        capacity: 1,
        ...data,
      })),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          STATIONS.find((s) => s.id === where.id) ?? null,
      ),
    },
    counsellingRecord: {
      findUnique: jest.fn(async () => ({ id: 'counselling-1' })),
      update: jest.fn(async () => ({})),
    },
    encounter: {
      findUniqueOrThrow: jest.fn(async () => ({ id: 'enc-1', status: 'DRAFT' })),
      update: jest.fn(async ({ data }: { data: Row }) => ({ id: 'enc-1', ...data })),
      create: jest.fn(async () => ({ id: 'enc-new', clinicId: CLINIC, status: 'DRAFT' })),
    },
    clinic: { findFirst: jest.fn(async () => ({ id: CLINIC })) },
    patient: { findUnique: jest.fn(async () => ({ id: 'patient-1', primaryClinicId: CLINIC })) },
    user: {
      findFirst: jest.fn(async () => ({ id: 'vol-1' })),
      findUnique: jest.fn(async () => ({
        isActive: true,
        clinicRoles: [{ clinicId: CLINIC, role: 'VOLUNTEER' }],
      })),
    },
    staffShift: {
      findFirst: jest.fn(async () => ({ id: 'shift-1' })),
    },
    $executeRaw: jest.fn(async () => 0),
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { logWrite: jest.fn(async () => undefined) };
  const service = new StationService(prisma as never, audit as never);
  return { service, tx, prisma, audit, created, current: () => visit };
}

const actions = (audit: { logWrite: jest.Mock }) =>
  audit.logWrite.mock.calls.map(([event]) => (event as { action: string }).action);

describe('StationService', () => {
  describe('claim', () => {
    it('takes a queued patient and audits it inside the transaction', async () => {
      const { service, tx, audit } = setup();
      const result = await service.claim(CLINIC, 'visit-1', volunteer);

      expect(result.status).toBe('IN_PROGRESS');
      expect(result.claimedBy).toEqual({ id: 'vol-1', displayName: 'Name vol-1' });
      expect(audit.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STATION.CLAIM' }),
        tx,
      );
    });

    it('lets exactly one of two simultaneous claims through', async () => {
      const { service } = setup();
      const [first, second] = await Promise.allSettled([
        service.claim(CLINIC, 'visit-1', volunteer),
        service.claim(CLINIC, 'visit-1', otherVolunteer),
      ]);

      expect(first.status).toBe('fulfilled');
      expect(second.status).toBe('rejected');
      const error = (second as PromiseRejectedResult).reason as ConflictException;
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: 'STATION_VISIT_ALREADY_CLAIMED',
        claimedBy: { id: 'vol-1' },
      });
    });

    it('treats a repeated tap by the holder as success', async () => {
      const { service } = setup({
        status: 'IN_PROGRESS',
        claimedByUserId: 'vol-1',
        claimedAt: new Date(),
      });
      await expect(service.claim(CLINIC, 'visit-1', volunteer)).resolves.toMatchObject({
        status: 'IN_PROGRESS',
      });
    });

    it('opens the encounter on the first claim of a check-in', async () => {
      const { service, tx, audit } = setup({ encounterId: null });
      tx.patientCheckIn.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'checkin-1',
        clinicId: CLINIC,
        patientId: 'patient-1',
        status: 'WAITING',
        encounterId: null,
      } as never);

      await service.claim(CLINIC, 'visit-1', volunteer);

      expect(tx.encounter.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ createdByUserId: 'vol-1', status: 'DRAFT' }),
      });
      expect(tx.patientCheckIn.update).toHaveBeenCalledWith({
        where: { id: 'checkin-1' },
        data: { encounterId: 'enc-new', status: 'IN_PROGRESS' },
      });
      expect(actions(audit)).toEqual(
        expect.arrayContaining(['ENCOUNTER.CREATE', 'CHECKIN.STATUS.UPDATE', 'STATION.CLAIM']),
      );
    });

    it('requires an active shift', async () => {
      const { service, prisma } = setup();
      prisma.staffShift.findFirst.mockResolvedValueOnce(null as never);
      await expect(service.claim(CLINIC, 'visit-1', volunteer)).rejects.toMatchObject({
        response: { code: 'SHIFT_REQUIRED' },
      });
    });

    it('refuses a visit from another clinic', async () => {
      const { service } = setup({ clinicId: 'clinic-2' });
      await expect(service.claim(CLINIC, 'visit-1', volunteer)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('assign', () => {
    it('hands a queued patient to a named volunteer and records who assigned them', async () => {
      const { service, tx, audit, current } = setup();
      const result = await service.assign(CLINIC, 'visit-1', 'vol-2', manager);

      expect(result.status).toBe('IN_PROGRESS');
      expect(result.claimedBy).toEqual({ id: 'vol-2', displayName: 'Name vol-2' });
      expect(result.assignedBy).toEqual({ id: 'mgr-1', displayName: 'Name mgr-1' });
      expect(current()).toMatchObject({ claimedByUserId: 'vol-2', assignedByUserId: 'mgr-1' });
      expect(audit.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STATION.ASSIGN', actorUserId: 'mgr-1' }),
        tx,
      );
      expect(actions(audit)).not.toContain('STATION.CLAIM');
    });

    it('leaves assignedBy empty on a self-claim', async () => {
      const { service, current } = setup();
      await service.claim(CLINIC, 'visit-1', volunteer);
      expect(current().assignedByUserId).toBeNull();
    });

    it('is refused to a volunteer', async () => {
      const { service, prisma } = setup();
      await expect(service.assign(CLINIC, 'visit-1', 'vol-2', volunteer)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses an assignee who is not on shift', async () => {
      const { service, prisma } = setup();
      prisma.staffShift.findFirst.mockResolvedValueOnce(null as never);
      await expect(service.assign(CLINIC, 'visit-1', 'vol-2', manager)).rejects.toMatchObject({
        response: { code: 'ASSIGNEE_NOT_ON_SHIFT' },
      });
    });

    it('refuses an assignee whose station role is at another clinic', async () => {
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        isActive: true,
        clinicRoles: [{ clinicId: 'clinic-2', role: 'VOLUNTEER' }],
      } as never);
      await expect(service.assign(CLINIC, 'visit-1', 'vol-2', manager)).rejects.toMatchObject({
        response: { code: 'ASSIGNEE_NOT_STATION_STAFF' },
      });
    });

    it('refuses a deactivated assignee and one with no station role', async () => {
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        isActive: false,
        clinicRoles: [{ clinicId: CLINIC, role: 'VOLUNTEER' }],
      } as never);
      await expect(service.assign(CLINIC, 'visit-1', 'vol-2', manager)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      prisma.user.findUnique.mockResolvedValueOnce({
        isActive: true,
        clinicRoles: [{ clinicId: CLINIC, role: 'DIRECTOR' }],
      } as never);
      await expect(service.assign(CLINIC, 'visit-1', 'vol-2', manager)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('loses cleanly to a volunteer who claims the patient at the same moment', async () => {
      const { service } = setup();
      const [selfClaim, assignment] = await Promise.allSettled([
        service.claim(CLINIC, 'visit-1', volunteer),
        service.assign(CLINIC, 'visit-1', 'vol-2', manager),
      ]);

      expect(selfClaim.status).toBe('fulfilled');
      expect(assignment.status).toBe('rejected');
      expect(
        ((assignment as PromiseRejectedResult).reason as ConflictException).getResponse(),
      ).toMatchObject({ code: 'STATION_VISIT_ALREADY_CLAIMED', claimedBy: { id: 'vol-1' } });
    });

    it('is cleared when the assignee hands the patient back to the queue', async () => {
      const { service, current } = setup({
        status: 'IN_PROGRESS',
        claimedByUserId: 'vol-2',
        claimedAt: new Date(),
        assignedByUserId: 'mgr-1',
      });
      await service.release(CLINIC, 'visit-1', otherVolunteer, 'Needs a Twi speaker');
      expect(current()).toMatchObject({
        status: 'QUEUED',
        claimedByUserId: null,
        assignedByUserId: null,
      });
    });
  });

  describe('release', () => {
    it('puts the patient back in the queue', async () => {
      const { service, current } = setup({
        status: 'IN_PROGRESS',
        claimedByUserId: 'vol-1',
        claimedAt: new Date(),
      });
      await service.release(CLINIC, 'visit-1', volunteer, 'Needs the toilet');

      expect(current()).toMatchObject({
        status: 'QUEUED',
        claimedByUserId: null,
        releaseCount: 1,
        endReason: 'Needs the toilet',
      });
    });

    it("refuses to release someone else's patient without the manager override", async () => {
      const { service } = setup({
        status: 'IN_PROGRESS',
        claimedByUserId: 'vol-2',
        claimedAt: new Date(),
      });
      await expect(service.release(CLINIC, 'visit-1', volunteer, 'x')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.release(CLINIC, 'visit-1', volunteer, 'x', { force: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.release(CLINIC, 'visit-1', manager, 'Stale claim', { force: true }),
      ).resolves.toMatchObject({ status: 'QUEUED' });
    });
  });

  describe('complete', () => {
    const held = { status: 'IN_PROGRESS', claimedByUserId: 'vol-1', claimedAt: new Date() };

    it('hands the patient to the next station in order', async () => {
      const { service, created } = setup(held);
      const result = await service.complete(CLINIC, 'visit-1', volunteer, {
        handoffNote: 'BP high, recheck at review',
      });

      expect(result).toMatchObject({ nextStationId: 'st-glucose', sessionCompleted: false });
      expect(result.visit).toMatchObject({
        status: 'COMPLETED',
        handoffNote: 'BP high, recheck at review',
      });
      expect(created).toEqual([
        expect.objectContaining({
          stationId: 'st-glucose',
          status: 'QUEUED',
          encounterId: 'enc-1',
        }),
      ]);
    });

    it('records each skipped station with its reason', async () => {
      const { service, created, audit } = setup(held);
      const result = await service.complete(CLINIC, 'visit-1', volunteer, {
        skips: [{ stationId: 'st-glucose', reason: 'Out of strips' }],
      });

      expect(result.nextStationId).toBe('st-anthro');
      expect(created[0]).toMatchObject({
        stationId: 'st-glucose',
        status: 'SKIPPED',
        endReason: 'Out of strips',
      });
      expect(actions(audit)).toContain('STATION.SKIP');
    });

    it('sends the patient to a station the volunteer chose', async () => {
      const { service } = setup(held);
      const result = await service.complete(CLINIC, 'visit-1', volunteer, {
        nextStationId: 'st-review',
      });
      expect(result.nextStationId).toBe('st-review');
    });

    it.each([
      ['skip the review station', { skips: [{ stationId: 'st-review', reason: 'x' }] }],
      ['send the patient back to the same station', { nextStationId: 'st-bp' }],
    ])('refuses to %s', async (_label, dto) => {
      const { service } = setup(held);
      await expect(service.complete(CLINIC, 'visit-1', volunteer, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('only lets the holder complete', async () => {
      const { service } = setup({ ...held, claimedByUserId: 'vol-2' });
      await expect(service.complete(CLINIC, 'visit-1', volunteer, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('requires counselling before the review station completes the session', async () => {
      const { service, tx } = setup({ ...held, stationId: 'st-review' });
      tx.counsellingRecord.findUnique.mockResolvedValueOnce(null as never);
      await expect(service.complete(CLINIC, 'visit-1', volunteer, {})).rejects.toMatchObject({
        response: { code: 'COUNSELLING_REQUIRED' },
      });
    });

    it('completes the session at the review station', async () => {
      const { service, tx, created, audit } = setup({ ...held, stationId: 'st-review' });
      const result = await service.complete(CLINIC, 'visit-1', volunteer, {});

      expect(result).toMatchObject({ sessionCompleted: true, nextStationId: null });
      expect(created).toEqual([]);
      expect(tx.counsellingRecord.update).toHaveBeenCalledWith({
        where: { encounterId: 'enc-1' },
        data: { lockedAt: expect.any(Date) },
      });
      expect(tx.encounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: { status: 'IN_REVIEW' },
      });
      expect(tx.patientCheckIn.update).toHaveBeenCalledWith({
        where: { id: 'checkin-1' },
        data: { status: 'COMPLETED' },
      });
      expect(actions(audit)).toEqual(
        expect.arrayContaining([
          'ENCOUNTER.SUBMIT_FOR_REVIEW',
          'CHECKIN.STATUS.UPDATE',
          'STATION.COMPLETE',
        ]),
      );
    });
  });

  describe('manager overrides', () => {
    it('moves a patient to any active station', async () => {
      const { service, created, current } = setup();
      const result = await service.moveCheckIn(CLINIC, 'checkin-1', manager, {
        stationId: 'st-review',
        reason: 'Fast-track: feeling faint',
      });

      expect(result.stationId).toBe('st-review');
      expect(current().status).toBe('CANCELLED');
      expect(created[0]).toMatchObject({ stationId: 'st-review', status: 'QUEUED' });
    });

    it('refuses a move from a volunteer', async () => {
      const { service } = setup();
      await expect(
        service.moveCheckIn(CLINIC, 'checkin-1', volunteer, {
          stationId: 'st-review',
          reason: 'x',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets the holder record that the patient left, but not a bystander', async () => {
      const bystander = setup({
        status: 'IN_PROGRESS',
        claimedByUserId: 'vol-2',
        claimedAt: new Date(),
      });
      bystander.tx.patientStationVisit.findFirst.mockResolvedValueOnce(null);
      await expect(
        bystander.service.cancelCheckIn(CLINIC, 'checkin-1', volunteer, 'Left'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const holder = setup({
        status: 'IN_PROGRESS',
        claimedByUserId: 'vol-1',
        claimedAt: new Date(),
      });
      await holder.service.cancelCheckIn(CLINIC, 'checkin-1', volunteer, 'Left before BP');
      expect(holder.tx.patientCheckIn.update).toHaveBeenCalledWith({
        where: { id: 'checkin-1' },
        data: { status: 'CANCELLED' },
      });
      expect(holder.current()).toMatchObject({ status: 'CANCELLED', endReason: 'Left before BP' });
    });

    it('refuses to act on a finished session', async () => {
      const { service, tx } = setup();
      tx.patientCheckIn.findUnique.mockResolvedValueOnce({
        id: 'checkin-1',
        clinicId: CLINIC,
        patientId: 'patient-1',
        status: 'COMPLETED',
        encounterId: 'enc-1',
      });
      await expect(
        service.moveCheckIn(CLINIC, 'checkin-1', manager, { stationId: 'st-bp', reason: 'x' }),
      ).rejects.toMatchObject({ response: { code: 'CHECKIN_CLOSED' } });
    });
  });

  describe('stations', () => {
    it('will not close the review station or one with patients in it', async () => {
      const { service, tx } = setup();
      await expect(
        service.updateStation(CLINIC, 'st-review', manager, { active: false }),
      ).rejects.toMatchObject({ response: { code: 'REVIEW_STATION_REQUIRED' } });

      tx.patientStationVisit.count.mockResolvedValueOnce(2);
      await expect(
        service.updateStation(CLINIC, 'st-bp', manager, { active: false }),
      ).rejects.toMatchObject({ response: { code: 'STATION_HAS_PATIENTS' } });
    });

    it('records how many patients a station can see at once, 1 unless told (#32)', async () => {
      const { service, tx } = setup();
      const created = await service.createStation(CLINIC, manager, {
        kind: 'CUSTOM' as never,
        name: 'Vision screening',
      });
      expect(tx.clinicStation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ capacity: 1 }),
      });
      expect(created.capacity).toBe(1);

      const updated = await service.updateStation(CLINIC, 'st-bp', manager, { capacity: 3 });
      expect(tx.clinicStation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ capacity: 3 }) }),
      );
      expect(updated.capacity).toBe(3);
    });

    it('needs every station named once to reorder', async () => {
      const { service } = setup();
      await expect(
        service.reorderStations(CLINIC, manager, ['st-bp', 'st-intake']),
      ).rejects.toMatchObject({ response: { code: 'STATION_ORDER_INCOMPLETE' } });
    });
  });

  describe('queueAtFirstStation', () => {
    it('queues at the first active station', async () => {
      const { service, tx, created } = setup();
      await service.queueAtFirstStation(tx as never, {
        clinicId: CLINIC,
        checkInId: 'checkin-9',
        actorUserId: 'vol-1',
        at: new Date(),
      });
      expect(created[0]).toMatchObject({
        stationId: 'st-intake',
        status: 'QUEUED',
        patientCheckInId: 'checkin-9',
      });
    });

    it('leaves the check-in waiting when the clinic has no active station', async () => {
      const { service, tx, created } = setup();
      tx.clinicStation.findFirst.mockResolvedValueOnce(null as never);
      await expect(
        service.queueAtFirstStation(tx as never, {
          clinicId: CLINIC,
          checkInId: 'checkin-9',
          actorUserId: 'vol-1',
          at: new Date(),
        }),
      ).resolves.toBeNull();
      expect(created).toEqual([]);
    });
  });

  it('hands back held patients when a shift ends', async () => {
    const { service, tx } = setup();
    tx.patientStationVisit.findMany.mockResolvedValueOnce([
      { id: 'visit-1' },
      { id: 'visit-2' },
    ] as never);
    const released = await service.releaseForShiftEnd(tx as never, {
      clinicId: CLINIC,
      userId: 'vol-1',
      actorUserId: 'vol-1',
    });
    expect(released).toBe(2);
    expect(tx.patientStationVisit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'QUEUED', endReason: 'SHIFT_ENDED' }),
      }),
    );
  });
});
