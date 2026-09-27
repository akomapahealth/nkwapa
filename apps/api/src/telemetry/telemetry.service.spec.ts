import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TELEMETRY_BUFFER_LIMIT, TelemetryService, telemetryReasonFor } from './telemetry.service';
import {
  DEFAULT_TELEMETRY_RETENTION_DAYS,
  telemetryRetentionCutoff,
  telemetryRetentionDays,
} from './telemetry-retention.processor';

function setup() {
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    withSystemContext: jest.fn(async (_ctx: unknown, cb: (c: unknown) => Promise<unknown>) =>
      cb({ telemetryEvent: { createMany } }),
    ),
  };
  const service = new TelemetryService(prisma as never);
  return { service, prisma, createMany };
}

const written = (createMany: jest.Mock) =>
  createMany.mock.calls.flatMap(([arg]) => (arg as { data: unknown[] }).data);

describe('TelemetryService', () => {
  const original = process.env.TELEMETRY_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.TELEMETRY_ENABLED;
    else process.env.TELEMETRY_ENABLED = original;
    jest.restoreAllMocks();
  });

  it('writes a sanitized event under a system context, outside the request', async () => {
    const { service, prisma, createMany } = setup();
    service.record('appointment.request.submit', {
      clinicId: 'clinic-1',
      kind: 'NEW',
      patientName: 'Ama Mensah',
    });

    await service.flush();

    expect(prisma.withSystemContext).toHaveBeenCalledWith(
      { systemReason: expect.any(String) },
      expect.any(Function),
    );
    expect(written(createMany)).toEqual([
      expect.objectContaining({
        event: 'appointment.request.submit',
        category: 'appointments',
        clinicId: 'clinic-1',
        properties: { kind: 'NEW' },
      }),
    ]);
    expect(JSON.stringify(createMany.mock.calls)).not.toContain('Ama');
  });

  it('logs the refused keys and never their values', () => {
    const { service } = setup();
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    const log = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    service.record('portal.claim', { outcome: 'FAILED', email: 'ama@example.com' });

    const logged = JSON.stringify([...warn.mock.calls, ...log.mock.calls]);
    expect(logged).toContain('email');
    expect(logged).not.toContain('ama@example.com');
  });

  it('ignores an event the catalog does not name', async () => {
    const { service, createMany } = setup();
    service.record('not.a.real.event' as never, {});
    await service.flush();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('records nothing at all when telemetry is disabled', async () => {
    process.env.TELEMETRY_ENABLED = 'false';
    const { service, createMany } = setup();
    service.record('portal.claim', { outcome: 'SUCCEEDED' });
    await service.flush();
    expect(createMany).not.toHaveBeenCalled();
  });

  describe('track', () => {
    it('records a success with its duration and what the result says', async () => {
      const { service, createMany } = setup();
      const result = await service.track(
        'patient.merge.preview',
        { clinicId: 'clinic-1' },
        async () => ({ blockers: [1, 2] }),
        (preview) => ({ blocked: true, blockerCount: preview.blockers.length }),
      );
      await service.flush();

      expect(result).toEqual({ blockers: [1, 2] });
      expect(written(createMany)[0]).toMatchObject({
        outcome: 'SUCCEEDED',
        properties: expect.objectContaining({ blocked: true, blockerCount: 2 }),
      });
    });

    it('records a failure with the machine code and rethrows the original error', async () => {
      const { service, createMany } = setup();
      const error = new ConflictException({
        code: 'APPOINTMENT_INVALID_TRANSITION',
        message: 'Ama Mensah cannot be moved',
      });

      await expect(
        service.track('appointment.reschedule', { clinicId: 'clinic-1' }, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      await service.flush();

      expect(written(createMany)[0]).toMatchObject({
        outcome: 'FAILED',
        reason: 'APPOINTMENT_INVALID_TRANSITION',
      });
      expect(JSON.stringify(createMany.mock.calls)).not.toContain('Ama');
    });

    it('never lets a failing describe callback break the workflow', async () => {
      const { service } = setup();
      await expect(
        service.track(
          'portal.invite.create',
          {},
          async () => 'ok',
          () => {
            throw new Error('bad describe');
          },
        ),
      ).resolves.toBe('ok');
    });
  });

  describe('flush', () => {
    it('keeps a batch for the next tick when the write fails', async () => {
      const { service, createMany } = setup();
      jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
      createMany.mockRejectedValueOnce(new Error('database unavailable'));
      service.record('portal.claim', { outcome: 'SUCCEEDED' });

      await service.flush();
      await service.flush();

      expect(createMany).toHaveBeenCalledTimes(2);
      expect(written(createMany)).toHaveLength(2);
    });

    it('drops the oldest events rather than growing without bound', async () => {
      const { service, createMany } = setup();
      jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
      jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
      for (let i = 0; i < TELEMETRY_BUFFER_LIMIT + 10; i += 1) {
        service.record('portal.claim', { outcome: 'SUCCEEDED' });
      }
      await service.flush();
      expect(written(createMany)).toHaveLength(TELEMETRY_BUFFER_LIMIT);
    });
  });
});

describe('telemetryReasonFor', () => {
  it('uses the refusal code when there is one', () => {
    expect(telemetryReasonFor(new ConflictException({ code: 'INVITE_EXPIRED' }))).toBe(
      'INVITE_EXPIRED',
    );
  });

  it('falls back to the HTTP status name, never the message', () => {
    expect(telemetryReasonFor(new NotFoundException('Ama Mensah not found'))).toBe('NOT_FOUND');
    expect(telemetryReasonFor(new BadRequestException({ code: 'call 0244 123 456' }))).toBe(
      'BAD_REQUEST',
    );
  });

  it('calls anything else an application error', () => {
    expect(telemetryReasonFor(new Error('connection reset'))).toBe('APPLICATION_ERROR');
  });
});

describe('telemetry retention', () => {
  const original = process.env.TELEMETRY_RETENTION_DAYS;
  afterEach(() => {
    if (original === undefined) delete process.env.TELEMETRY_RETENTION_DAYS;
    else process.env.TELEMETRY_RETENTION_DAYS = original;
  });

  it('keeps 180 days by default and bounds a configured value', () => {
    delete process.env.TELEMETRY_RETENTION_DAYS;
    expect(telemetryRetentionDays()).toBe(DEFAULT_TELEMETRY_RETENTION_DAYS);
    process.env.TELEMETRY_RETENTION_DAYS = '1';
    expect(telemetryRetentionDays()).toBe(7);
    process.env.TELEMETRY_RETENTION_DAYS = '99999';
    expect(telemetryRetentionDays()).toBe(730);
    process.env.TELEMETRY_RETENTION_DAYS = 'forever';
    expect(telemetryRetentionDays()).toBe(DEFAULT_TELEMETRY_RETENTION_DAYS);
  });

  it('cuts off exactly the configured number of days back', () => {
    const now = new Date('2026-09-27T00:00:00.000Z');
    expect(telemetryRetentionCutoff(now, 30).toISOString()).toBe('2026-08-28T00:00:00.000Z');
  });
});
