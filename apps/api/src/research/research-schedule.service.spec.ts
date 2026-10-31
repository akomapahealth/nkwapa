import { BadRequestException, ConflictException } from '@nestjs/common';
import type { JobStep } from '../prisma/job-tenant-context.runner';
import { ResearchScheduleService } from './research-schedule.service';

const CLINIC = 'c0000000-0000-4000-8000-000000000001';
const CLINIC_KEY = '3f9a2c1d5e6b7a8c9d0e1f2a3b4c5d6e';
const actor = { clinicId: CLINIC, userId: 'director-1' };
const DAY_MS = 86_400_000;

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    clinicId: CLINIC,
    cadence: 'MONTHLY',
    dayOfWeek: null,
    dayOfMonth: 1,
    localHour: 3,
    coverageStartDate: '2026-01-01',
    destination: 'LOCAL',
    status: 'ACTIVE',
    statusReason: null,
    reviewBy: new Date(Date.now() + 200 * DAY_MS),
    createdByUserId: 'requester-1',
    approvedByUserId: 'director-1',
    approvedAt: new Date('2026-01-02T00:00:00Z'),
    lastRunAt: null,
    nextRunAt: new Date('2026-11-01T03:00:00Z'),
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    createdBy: { id: 'requester-1', displayName: 'Requester' },
    approvedBy: { id: 'director-1', displayName: 'Director' },
    clinic: { timezone: 'Africa/Accra' },
    runs: [],
    ...overrides,
  };
}

function build() {
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    clinicResearchSettings: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ researchEnabled: true, requiresDirectorApprovalEachExport: true }),
    },
    researchExportSchedule: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(({ data }) => Promise.resolve(schedule({ ...data }))),
      update: jest.fn(({ data }) => Promise.resolve(schedule({ ...data }))),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
  const exports = {
    clinicTimeZone: jest.fn().mockResolvedValue('Africa/Accra'),
    createRun: jest.fn(({ runKey }) => Promise.resolve({ id: 'e1', runKey })),
    findByRunKey: jest.fn().mockResolvedValue(null),
    adHocRunKey: jest.fn().mockResolvedValue('rx-3f9a2c1d-a20261030-ab12'),
    toExportView: jest.fn((run) => run),
  };
  const deIdService = { clinicKey: jest.fn(() => CLINIC_KEY) };
  const storage = {
    available: jest.fn(() => ['LOCAL']),
    defaultProvider: jest.fn(() => 'LOCAL'),
    assertAvailable: jest.fn(),
  };
  const service = new ResearchScheduleService(
    prisma as never,
    audit as never,
    exports as never,
    deIdService as never,
    storage as never,
  );
  return { service, prisma, audit, exports };
}

const actions = (audit: { logWrite: jest.Mock }) =>
  audit.logWrite.mock.calls.map(([entry]) => entry.action);

// Runs every step inline, standing in for the tenant-context runner.
const inline: JobStep = (work) => work(undefined as never);

describe('ResearchScheduleService', () => {
  const dto = {
    cadence: 'MONTHLY' as const,
    dayOfMonth: 1,
    localHour: 3,
    coverageStartDate: '2026-01-01',
  };

  describe('create', () => {
    it('refuses when research is not enabled', async () => {
      const { service, prisma } = build();
      prisma.clinicResearchSettings.findUnique.mockResolvedValue({ researchEnabled: false });
      await expect(service.create(actor, dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses coverage that starts today or later', async () => {
      const { service } = build();
      await expect(
        service.create(actor, { ...dto, coverageStartDate: '2999-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows one live schedule per destination', async () => {
      const { service, prisma } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue({ id: 'other' });
      await expect(service.create(actor, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.researchExportSchedule.create).not.toHaveBeenCalled();
    });

    it('waits for approval when the clinic requires it', async () => {
      const { service, prisma, audit } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue(null);
      await service.create(actor, dto);
      const { data } = prisma.researchExportSchedule.create.mock.calls[0][0];
      expect(data.status).toBeUndefined();
      expect(data.nextRunAt).toBeUndefined();
      expect(actions(audit)).toEqual(['RESEARCH_SCHEDULE.CREATE']);
    });

    it('activates at once when the clinic does not require approval', async () => {
      const { service, prisma } = build();
      prisma.clinicResearchSettings.findUnique.mockResolvedValue({
        researchEnabled: true,
        requiresDirectorApprovalEachExport: false,
      });
      prisma.researchExportSchedule.findFirst.mockResolvedValue(null);
      await service.create(actor, dto);
      const { data } = prisma.researchExportSchedule.create.mock.calls[0][0];
      expect(data).toMatchObject({ status: 'ACTIVE', approvedByUserId: 'director-1' });
      expect(data.nextRunAt.getTime()).toBeGreaterThan(Date.now());
      expect(data.reviewBy.getTime()).toBeGreaterThan(Date.now() + 360 * DAY_MS);
    });
  });

  describe('state machine', () => {
    it('sends an edited schedule back for approval', async () => {
      const { service, prisma } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue(schedule());
      await service.update(actor, 's1', { ...dto, localHour: 5 });
      expect(prisma.researchExportSchedule.update.mock.calls[0][0].data).toMatchObject({
        localHour: 5,
        status: 'PENDING_APPROVAL',
        approvedByUserId: null,
        nextRunAt: null,
      });
    });

    it('approves a pending schedule conditionally on its status', async () => {
      const { service, prisma, audit } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue(
        schedule({ status: 'PENDING_APPROVAL', nextRunAt: null }),
      );
      await service.approve(actor, 's1', {});
      const [call] = prisma.researchExportSchedule.updateMany.mock.calls;
      expect(call[0].where).toMatchObject({ id: 's1', status: 'PENDING_APPROVAL' });
      expect(call[0].data).toMatchObject({ status: 'ACTIVE', approvedByUserId: 'director-1' });
      expect(actions(audit)).toEqual(['RESEARCH_SCHEDULE.APPROVE']);
    });

    it('reports a lost race as a conflict', async () => {
      const { service, prisma } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue(
        schedule({ status: 'PENDING_APPROVAL' }),
      );
      prisma.researchExportSchedule.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.approve(actor, 's1', {})).rejects.toBeInstanceOf(ConflictException);
    });

    it.each([
      ['approve', 'ACTIVE'],
      ['pause', 'PAUSED'],
      ['resume', 'ACTIVE'],
      ['reject', 'ACTIVE'],
      ['revoke', 'REVOKED'],
      ['runNow', 'PAUSED'],
    ] as const)('refuses to %s a schedule that is %s', async (method, status) => {
      const { service, prisma } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue(schedule({ status }));
      const call =
        method === 'approve'
          ? service.approve(actor, 's1', {})
          : method === 'reject' || method === 'revoke'
            ? service[method](actor, 's1', 'reason')
            : service[method](actor, 's1');
      await expect(call).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a review date beyond 24 months', async () => {
      const { service, prisma } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue(
        schedule({ status: 'PENDING_APPROVAL' }),
      );
      const far = new Date(Date.now() + 800 * DAY_MS).toISOString();
      await expect(service.approve(actor, 's1', { reviewBy: far })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('will not resume a schedule past its review date', async () => {
      const { service, prisma } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue(
        schedule({ status: 'PAUSED', reviewBy: new Date(Date.now() - DAY_MS) }),
      );
      await expect(service.resume(actor, 's1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('runNow', () => {
    it('creates a manual run under the schedule with an ad-hoc key', async () => {
      const { service, prisma, exports, audit } = build();
      prisma.researchExportSchedule.findFirst.mockResolvedValue(schedule());
      const run = await service.runNow(actor, 's1');
      expect(exports.createRun.mock.calls[0][0]).toMatchObject({
        trigger: 'MANUAL',
        scheduleId: 's1',
        fromDate: '2026-01-01',
        runKey: 'rx-3f9a2c1d-a20261030-ab12',
        storageProvider: 'LOCAL',
      });
      expect(run).toMatchObject({ runKey: 'rx-3f9a2c1d-a20261030-ab12' });
      expect(actions(audit)).toEqual(['RESEARCH_SCHEDULE.RUN_NOW']);
    });
  });

  describe('dispatchDue', () => {
    const now = new Date('2026-11-01T03:05:00Z');

    function due(h: ReturnType<typeof build>, record = schedule()) {
      h.prisma.researchExportSchedule.findMany.mockResolvedValue([
        { id: record.id, clinicId: record.clinicId },
      ]);
      h.prisma.researchExportSchedule.findUnique.mockResolvedValue(record);
    }

    it('creates the period run under its run key and moves the schedule on', async () => {
      const h = build();
      due(h);
      const outcome = await h.service.dispatchDue(inline, () => inline, now);
      expect(outcome).toEqual({ dispatched: 1, duplicates: 0, failed: 0 });
      expect(h.exports.createRun.mock.calls[0][0]).toMatchObject({
        runKey: 'rx-3f9a2c1d-m2026-11',
        trigger: 'SCHEDULED',
        fromDate: '2026-01-01',
        toDate: '2026-10-31',
      });
      const { data } = h.prisma.researchExportSchedule.update.mock.calls[0][0];
      expect(data.nextRunAt.toISOString()).toBe('2026-12-01T03:00:00.000Z');
      expect(actions(h.audit)).toEqual(['RESEARCH_SCHEDULE.DISPATCH']);
    });

    it('makes one run when the same period fires twice', async () => {
      const h = build();
      due(h);
      h.exports.findByRunKey.mockResolvedValue({ id: 'e1', runKey: 'rx-3f9a2c1d-m2026-11' });
      const outcome = await h.service.dispatchDue(inline, () => inline, now);
      expect(outcome).toEqual({ dispatched: 0, duplicates: 1, failed: 0 });
      expect(h.exports.createRun).not.toHaveBeenCalled();
    });

    it('skips a schedule another instance already moved on', async () => {
      const h = build();
      due(h, schedule({ nextRunAt: new Date('2026-12-01T03:00:00Z') }));
      const outcome = await h.service.dispatchDue(inline, () => inline, now);
      expect(outcome).toEqual({ dispatched: 0, duplicates: 0, failed: 0 });
      expect(h.prisma.researchExportSchedule.update).not.toHaveBeenCalled();
    });

    it('still records the run, then expires a schedule past its review date', async () => {
      const h = build();
      due(h, schedule({ reviewBy: new Date('2026-10-01T00:00:00Z') }));
      await h.service.dispatchDue(inline, () => inline, now);
      expect(h.exports.createRun).toHaveBeenCalledTimes(1);
      expect(h.prisma.researchExportSchedule.update.mock.calls[0][0].data).toMatchObject({
        status: 'EXPIRED',
        nextRunAt: null,
      });
      expect(actions(h.audit)).toEqual(['RESEARCH_SCHEDULE.EXPIRE']);
    });

    it('carries on past one clinic that fails', async () => {
      const h = build();
      h.prisma.researchExportSchedule.findMany.mockResolvedValue([
        { id: 's1', clinicId: CLINIC },
        { id: 's2', clinicId: 'c0000000-0000-4000-8000-000000000002' },
      ]);
      h.prisma.researchExportSchedule.findUnique
        .mockRejectedValueOnce(new Error('boom') as never)
        .mockResolvedValueOnce(schedule({ id: 's2' }));
      const clinicStep = jest.fn(() => inline);
      const outcome = await h.service.dispatchDue(inline, clinicStep, now);
      expect(outcome).toEqual({ dispatched: 1, duplicates: 0, failed: 1 });
      expect(clinicStep).toHaveBeenCalledWith(CLINIC, 'research-schedule:s1');
    });
  });
});
