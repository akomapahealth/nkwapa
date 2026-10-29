import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
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
      groupBy: jest.fn(async (): Promise<Row[]> => []),
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
      findFirst: jest.fn(
        async (): Promise<Row> => ({
          id: 'shift-1',
          screenerIsAccountHolder: true,
          screenerName: null,
        }),
      ),
      findUnique: jest.fn(
        async (): Promise<Row | null> => ({
          id: 'shift-1',
          clinicId: CLINIC,
          userId: 'vol-1',
          status: 'ACTIVE',
          screenerIsAccountHolder: true,
          screenerName: null,
        }),
      ),
      update: jest.fn(async ({ data }: { data: Row }) => ({ id: 'shift-1', ...data })),
      findMany: jest.fn(async (): Promise<Row[]> => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    volunteerContact: {
      findFirst: jest.fn(async (): Promise<Row | null> => null),
      findMany: jest.fn(async (): Promise<Row[]> => []),
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

/** Whether the clinic's station lock was taken (`lockForTransaction` passes the key as a value). */
const tookStationLock = (tx: { $executeRaw: jest.Mock }) =>
  tx.$executeRaw.mock.calls.some((call: unknown[]) =>
    call.slice(1).includes(`clinic-stations:${CLINIC}`),
  );

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

    it('closing a station clears it from every active shift there and audits each (#228)', async () => {
      const { service, tx, audit } = setup();
      tx.staffShift.findMany.mockResolvedValueOnce([{ id: 'shift-1' }, { id: 'shift-2' }]);
      tx.staffShift.updateMany.mockResolvedValueOnce({ count: 2 });

      await service.updateStation(CLINIC, 'st-glucose', manager, { active: false });

      // Only this clinic's active shifts: other clinics and closed shifts never match.
      const where = { clinicId: CLINIC, stationId: 'st-glucose', status: 'ACTIVE' };
      expect(tx.staffShift.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(tx.staffShift.updateMany).toHaveBeenCalledWith({ where, data: { stationId: null } });
      const cleared = (audit.logWrite.mock.calls as unknown as [Row, unknown][]).filter(
        ([event]) => event.action === 'SHIFT.STATION.UPDATE',
      );
      expect(cleared.map(([event]) => event.entityId)).toEqual(['shift-1', 'shift-2']);
      for (const [event, client] of cleared) {
        expect(JSON.parse(event.afterJson as string)).toEqual({
          stationId: null,
          reason: 'STATION_DEACTIVATED',
        });
        expect(client).toBe(tx);
      }
      expect(tookStationLock(tx)).toBe(true);
    });

    it('leaves shifts alone when a station is renamed or already closed', async () => {
      const { service, tx } = setup();
      await service.updateStation(CLINIC, 'st-glucose', manager, { name: 'Sugar' });
      tx.clinicStation.findUnique.mockResolvedValueOnce({ ...STATIONS[2], active: false });
      await service.updateStation(CLINIC, 'st-glucose', manager, { active: false });
      expect(tx.staffShift.findMany).not.toHaveBeenCalled();
      expect(tx.staffShift.updateMany).not.toHaveBeenCalled();
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

    describe('setShiftStation (#228)', () => {
      it('sets the station on your own active shift and audits it in the transaction', async () => {
        const { service, tx, audit } = setup();
        const result = await service.setShiftStation(CLINIC, 'shift-1', volunteer, 'st-bp');
        expect(result).toEqual({ shiftId: 'shift-1', stationId: 'st-bp' });
        expect(audit.logWrite).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'SHIFT.STATION.UPDATE', entityId: 'shift-1' }),
          tx,
        );
        expect(tookStationLock(tx)).toBe(true);
      });

      it('clears the station with null', async () => {
        const { service, tx } = setup();
        const result = await service.setShiftStation(CLINIC, 'shift-1', volunteer, null);
        expect(result.stationId).toBeNull();
        expect(tx.staffShift.update).toHaveBeenCalledWith({
          where: { id: 'shift-1' },
          data: { stationId: null },
        });
      });

      it("refuses someone else's shift", async () => {
        const { service, tx } = setup();
        await expect(
          service.setShiftStation(CLINIC, 'shift-1', otherVolunteer, 'st-bp'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(tx.staffShift.update).not.toHaveBeenCalled();
      });

      it('refuses a closed shift', async () => {
        const { service, tx } = setup();
        tx.staffShift.findUnique.mockResolvedValueOnce({
          id: 'shift-1',
          clinicId: CLINIC,
          userId: 'vol-1',
          status: 'CLOSED',
        });
        await expect(
          service.setShiftStation(CLINIC, 'shift-1', volunteer, 'st-bp'),
        ).rejects.toMatchObject({ status: 409, response: { code: 'SHIFT_ALREADY_CLOSED' } });
      });

      it('refuses a closed station', async () => {
        const { service, tx } = setup();
        tx.clinicStation.findUnique.mockResolvedValueOnce({ ...STATIONS[1], active: false });
        await expect(
          service.setShiftStation(CLINIC, 'shift-1', volunteer, 'st-bp'),
        ).rejects.toMatchObject({ status: 409, response: { code: 'STATION_INACTIVE' } });
        expect(tx.staffShift.update).not.toHaveBeenCalled();
      });

      it("answers 404 for another clinic's station or shift", async () => {
        const { service, tx } = setup();
        tx.clinicStation.findUnique.mockResolvedValueOnce({
          ...STATIONS[1],
          clinicId: 'clinic-2',
        });
        await expect(
          service.setShiftStation(CLINIC, 'shift-1', volunteer, 'st-bp'),
        ).rejects.toMatchObject({ status: 404, response: { code: 'STATION_NOT_FOUND' } });

        tx.staffShift.findUnique.mockResolvedValueOnce({
          id: 'shift-1',
          clinicId: 'clinic-2',
          userId: 'vol-1',
          status: 'ACTIVE',
        });
        await expect(
          service.setShiftStation(CLINIC, 'shift-1', volunteer, 'st-bp'),
        ).rejects.toMatchObject({ status: 404, response: { code: 'SHIFT_NOT_FOUND' } });
        expect(tx.staffShift.update).not.toHaveBeenCalled();
      });
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
      screener: {
        screenerIsAccountHolder: false,
        screenerName: 'Ama Mensah',
        screenerVolunteerContactId: 'contact-1',
      },
    });
    expect(released).toBe(2);
    expect(tx.patientStationVisit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          endReason: 'SHIFT_ENDED',
          performedByIsAccountHolder: false,
          performedByName: 'Ama Mensah',
          performedByVolunteerContactId: 'contact-1',
        }),
      }),
    );
  });

  describe('who actually screened (#227)', () => {
    const held = { status: 'IN_PROGRESS', claimedByUserId: 'vol-1', claimedAt: new Date() };
    const ama = { isAccountHolder: false, name: '  Ama Mensah ' };

    it('sets the screener on your own active shift, trimmed and audited', async () => {
      const { service, tx, audit } = setup();
      await expect(service.setShiftScreener(CLINIC, 'shift-1', volunteer, ama)).resolves.toEqual({
        shiftId: 'shift-1',
        screenerIsAccountHolder: false,
        screenerName: 'Ama Mensah',
      });
      expect(tx.staffShift.update).toHaveBeenCalledWith({
        where: { id: 'shift-1' },
        data: {
          screenerIsAccountHolder: false,
          screenerName: 'Ama Mensah',
          screenerVolunteerContactId: null,
        },
      });
      expect(actions(audit)).toEqual(['SHIFT.SCREENER.UPDATE']);
    });

    it("refuses another user's shift, a closed shift, and another clinic's", async () => {
      const { service, tx } = setup();
      const shift = { id: 'shift-1', clinicId: CLINIC, userId: 'vol-1', status: 'ACTIVE' };
      tx.staffShift.findUnique.mockResolvedValueOnce({ ...shift, userId: 'vol-2' });
      await expect(
        service.setShiftScreener(CLINIC, 'shift-1', volunteer, ama),
      ).rejects.toBeInstanceOf(ForbiddenException);
      tx.staffShift.findUnique.mockResolvedValueOnce({ ...shift, status: 'CLOSED' });
      await expect(
        service.setShiftScreener(CLINIC, 'shift-1', volunteer, ama),
      ).rejects.toMatchObject({ response: { code: 'SHIFT_ALREADY_CLOSED' } });
      tx.staffShift.findUnique.mockResolvedValueOnce({ ...shift, clinicId: 'clinic-2' });
      await expect(
        service.setShiftScreener(CLINIC, 'shift-1', volunteer, ama),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.staffShift.update).not.toHaveBeenCalled();
    });

    it('needs a name when someone else is screening', async () => {
      const { service, tx } = setup(held);
      for (const name of [undefined, '', '   ']) {
        await expect(
          service.setShiftScreener(CLINIC, 'shift-1', volunteer, { isAccountHolder: false, name }),
        ).rejects.toMatchObject({ response: { code: 'SCREENER_NAME_REQUIRED' } });
        await expect(
          service.complete(CLINIC, 'visit-1', volunteer, {
            screener: { isAccountHolder: false, name },
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(tx.staffShift.update).not.toHaveBeenCalled();
    });

    it('stamps the screener sent with the completion, and on each skipped stop', async () => {
      const { service, created, current } = setup(held);
      const result = await service.complete(CLINIC, 'visit-1', volunteer, {
        screener: ama,
        skips: [{ stationId: 'st-glucose', reason: 'Out of strips' }],
      });
      expect(current()).toMatchObject({
        completedByUserId: 'vol-1',
        performedByIsAccountHolder: false,
        performedByName: 'Ama Mensah',
      });
      expect(result.visit.performedByName).toBe('Ama Mensah');
      expect(created[0]).toMatchObject({
        status: 'SKIPPED',
        performedByIsAccountHolder: false,
        performedByName: 'Ama Mensah',
      });
    });

    it("falls back to the shift's screener, then the account holder, for older clients", async () => {
      const first = setup(held);
      first.tx.staffShift.findFirst.mockResolvedValueOnce({
        screenerIsAccountHolder: false,
        screenerName: 'Ama Mensah',
      });
      await first.service.complete(CLINIC, 'visit-1', volunteer, {});
      expect(first.current()).toMatchObject({ performedByName: 'Ama Mensah' });

      const second = setup(held);
      const result = await second.service.complete(CLINIC, 'visit-1', volunteer, {});
      expect(second.current()).toMatchObject({
        performedByIsAccountHolder: true,
        performedByName: null,
      });
      expect(result.visit.performedByName).toBeNull();
    });

    it('stamps a self-release from the shift, and clears it on a forced release', async () => {
      const own = setup(held);
      own.tx.staffShift.findFirst.mockResolvedValueOnce({
        screenerIsAccountHolder: false,
        screenerName: 'Ama Mensah',
      });
      await own.service.release(CLINIC, 'visit-1', volunteer, 'Needs the toilet');
      expect(own.current()).toMatchObject({ performedByName: 'Ama Mensah' });

      const forced = setup({ ...held, performedByIsAccountHolder: false, performedByName: 'Old' });
      await forced.service.release(CLINIC, 'visit-1', manager, 'Stale', { force: true });
      expect(forced.current()).toMatchObject({
        performedByIsAccountHolder: null,
        performedByName: null,
      });
    });

    it('never writes the screener name to application logs', async () => {
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) => [
        jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
        jest.spyOn(Logger, level).mockImplementation(() => undefined),
      ]);
      const consoleSpies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((level) =>
        jest.spyOn(console, level).mockImplementation(() => undefined),
      );
      try {
        const { service } = setup(held);
        await service.setShiftScreener(CLINIC, 'shift-1', volunteer, ama);
        await service.complete(CLINIC, 'visit-1', volunteer, { screener: ama });
        await expect(
          service.complete(CLINIC, 'visit-1', volunteer, { screener: ama }),
        ).rejects.toBeDefined();
        for (const spy of [...spies.flat(), ...consoleSpies]) {
          expect(JSON.stringify(spy.mock.calls)).not.toContain('Ama Mensah');
        }
      } finally {
        [...spies.flat(), ...consoleSpies].forEach((spy) => spy.mockRestore());
      }
    });

    it("suggests the clinic's active volunteer directory, with each contact's id (#226)", async () => {
      const { service, tx } = setup();
      tx.volunteerContact.findMany.mockResolvedValueOnce([
        { id: 'contact-1', displayName: 'Ama Mensah' },
      ]);
      await expect(service.getScreenerNames(CLINIC)).resolves.toEqual({
        items: [{ name: 'Ama Mensah', volunteerContactId: 'contact-1' }],
      });
      expect(tx.volunteerContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clinicId: CLINIC, isActive: true } }),
      );
    });

    describe('picked from the directory (#226)', () => {
      it("takes the name from the server's copy and keeps the contact id", async () => {
        const { service, tx } = setup();
        tx.volunteerContact.findFirst.mockResolvedValueOnce({
          id: 'contact-1',
          displayName: 'Ama Mensah',
        });
        await service.setShiftScreener(CLINIC, 'shift-1', volunteer, {
          isAccountHolder: false,
          name: 'Typed Differently',
          volunteerContactId: 'contact-1',
        });
        expect(tx.volunteerContact.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'contact-1', clinicId: CLINIC, isActive: true } }),
        );
        expect(tx.staffShift.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              screenerIsAccountHolder: false,
              screenerName: 'Ama Mensah',
              screenerVolunteerContactId: 'contact-1',
            },
          }),
        );
      });

      it('refuses a contact from another clinic or one deactivated, with 400', async () => {
        const { service, tx } = setup();
        await expect(
          service.setShiftScreener(CLINIC, 'shift-1', volunteer, {
            isAccountHolder: false,
            name: 'Ama Mensah',
            volunteerContactId: 'contact-elsewhere',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.staffShift.update).not.toHaveBeenCalled();
      });

      it("carries the shift's contact onto the stop it completes", async () => {
        const { service, tx, current } = setup({
          status: 'IN_PROGRESS',
          claimedByUserId: 'vol-1',
          claimedAt: new Date(),
        });
        tx.staffShift.findFirst.mockResolvedValueOnce({
          id: 'shift-1',
          screenerIsAccountHolder: false,
          screenerName: 'Ama Mensah',
          screenerVolunteerContactId: 'contact-1',
        });
        await service.complete(CLINIC, 'visit-1', volunteer, {});
        expect(current()).toMatchObject({
          performedByName: 'Ama Mensah',
          performedByVolunteerContactId: 'contact-1',
        });
      });
    });

    describe('correction', () => {
      const done = {
        status: 'COMPLETED',
        claimedByUserId: 'vol-1',
        completedByUserId: 'vol-1',
        completedAt: new Date(),
      };
      const fix = { isAccountHolder: false, name: 'Kwame Asante', reason: 'Wrong name' };

      it('lets the completing account correct before the counselling lock, with an audit', async () => {
        const { service, current, audit } = setup(done);
        await service.correctPerformer(CLINIC, 'visit-1', volunteer, fix);
        expect(current()).toMatchObject({ performedByName: 'Kwame Asante' });
        const [event] = audit.logWrite.mock.calls[0] as unknown as [
          { action: string; afterJson: string },
        ];
        expect(event.action).toBe('STATION.PERFORMER.CORRECT');
        expect(JSON.parse(event.afterJson)).toMatchObject({
          performedByName: 'Kwame Asante',
          reason: 'Wrong name',
        });
      });

      it('refuses the holder after the lock and anyone else, but not a manager', async () => {
        const { service, tx } = setup(done);
        tx.counsellingRecord.findUnique.mockResolvedValue({ lockedAt: new Date() } as never);
        await expect(
          service.correctPerformer(CLINIC, 'visit-1', volunteer, fix),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.correctPerformer(CLINIC, 'visit-1', otherVolunteer, fix),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.correctPerformer(CLINIC, 'visit-1', manager, fix),
        ).resolves.toMatchObject({ performedByName: 'Kwame Asante' });
      });

      it('refuses a stop that has not finished', async () => {
        const { service } = setup(held);
        await expect(
          service.correctPerformer(CLINIC, 'visit-1', manager, fix),
        ).rejects.toMatchObject({ response: { code: 'STATION_VISIT_NOT_FINISHED' } });
      });
    });
  });
});
