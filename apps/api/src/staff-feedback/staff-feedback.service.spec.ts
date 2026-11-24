import { Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/constants/permissions';
import type { PrismaService } from '../prisma/prisma.service';
import type { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import type { MaintenanceScheduler } from '../maintenance/maintenance-scheduler';
import { StaffFeedbackService } from './staff-feedback.service';
import { StaffFeedbackController } from './staff-feedback.controller';
import {
  DEFAULT_STAFF_FEEDBACK_RETENTION_DAYS,
  StaffFeedbackRetentionSweep,
  staffFeedbackRetentionDays,
} from './staff-feedback-retention.sweep';
import type { StaffFeedbackReplayPayload } from './dto/staff-feedback.dto';

const REPORT: StaffFeedbackReplayPayload = {
  schemaVersion: 1,
  category: 'NOT_SAVED',
  text: '  The reading would not save  ',
  stationKind: 'GLUCOSE',
  context: {
    route: '/stations/visits/:id',
    role: 'Volunteer',
    version: 'abc1234',
    online: false,
    outboxSize: 2,
    occurredAt: '2026-11-21T09:00:00.000Z',
  },
};

describe('StaffFeedbackService', () => {
  let create: jest.Mock;
  let service: StaffFeedbackService;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({});
    service = new StaffFeedbackService({
      staffFeedback: { create, findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);
  });

  it('stores the report with its station and context, under the device id', async () => {
    await service.submit('clinic-1', 'user-1', 'report-1', REPORT);

    expect(create).toHaveBeenCalledWith({
      data: {
        id: 'report-1',
        clinicId: 'clinic-1',
        userId: 'user-1',
        category: 'NOT_SAVED',
        text: 'The reading would not save',
        stationKind: 'GLUCOSE',
        context: REPORT.context,
      },
    });
  });

  it('treats a replay of a stored report as done', async () => {
    create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );

    await expect(service.submit('clinic-1', 'user-1', 'report-1', REPORT)).resolves.toBeUndefined();
  });

  it('passes any other failure on, so the outbox retries', async () => {
    create.mockRejectedValueOnce(new Error('database down'));

    await expect(service.submit('clinic-1', 'user-1', 'report-1', REPORT)).rejects.toThrow(
      'database down',
    );
  });
});

describe('who reads problem reports', () => {
  it('needs FEEDBACK.READ, which only directors hold (and system admins, through *)', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, StaffFeedbackController.prototype.list),
    ).toBe(PERMISSIONS.FEEDBACK_READ);
    const readers = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(PERMISSIONS.FEEDBACK_READ))
      .map(([role]) => role);
    expect(readers).toEqual([UserRole.DIRECTOR]);
  });

  it('lets every staff role report, and no patient', () => {
    for (const role of [UserRole.DIRECTOR, UserRole.MANAGER, UserRole.DOCTOR, UserRole.VOLUNTEER]) {
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.FEEDBACK_SUBMIT);
    }
    expect(ROLE_PERMISSIONS[UserRole.PATIENT]).not.toContain(PERMISSIONS.FEEDBACK_SUBMIT);
  });
});

describe('StaffFeedbackRetentionSweep', () => {
  const original = process.env.STAFF_FEEDBACK_RETENTION_DAYS;
  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) delete process.env.STAFF_FEEDBACK_RETENTION_DAYS;
    else process.env.STAFF_FEEDBACK_RETENTION_DAYS = original;
  });

  it('keeps 12 months by default, clamped to 30 days to 2 years', () => {
    delete process.env.STAFF_FEEDBACK_RETENTION_DAYS;
    expect(staffFeedbackRetentionDays()).toBe(DEFAULT_STAFF_FEEDBACK_RETENTION_DAYS);
    process.env.STAFF_FEEDBACK_RETENTION_DAYS = '1';
    expect(staffFeedbackRetentionDays()).toBe(30);
    process.env.STAFF_FEEDBACK_RETENTION_DAYS = '9999';
    expect(staffFeedbackRetentionDays()).toBe(730);
  });

  it('deletes only reports older than the window, as system work', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    delete process.env.STAFF_FEEDBACK_RETENTION_DAYS;
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const runSystemJob = jest.fn(async (_ctx: unknown, run: (c: unknown) => Promise<unknown>) =>
      run({ staffFeedback: { deleteMany } }),
    );
    const sweep = new StaffFeedbackRetentionSweep(
      { register: jest.fn() } as unknown as MaintenanceScheduler,
      { runSystemJob } as unknown as JobTenantContextRunner,
    );

    await sweep.run();

    const cutoff: Date = deleteMany.mock.calls[0][0].where.createdAt.lt;
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(365);
  });
});
