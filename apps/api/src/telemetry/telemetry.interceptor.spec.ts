import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TELEMETRY_EVENTS, type TelemetryEventName } from '@nkwapa/db';
import { TelemetryInterceptor } from './telemetry.interceptor';
import { Track } from './track.decorator';
import { appointmentRequestKind, mergePreviewShape, portalInviteShape } from './track-descriptors';

class Routes {
  @Track('appointment.request.confirm', { describe: appointmentRequestKind })
  confirm() {}

  @Track('portal.claim', { clinicId: (result) => (result as { clinicId?: string })?.clinicId })
  claim() {}

  untracked() {}
}

function contextFor(handler: keyof Routes, request: Record<string, unknown>) {
  return {
    getType: () => 'http',
    getHandler: () => Routes.prototype[handler],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function setup() {
  const telemetry = { record: jest.fn() };
  const interceptor = new TelemetryInterceptor(new Reflector(), telemetry as never);
  return { telemetry, interceptor };
}

describe('TelemetryInterceptor', () => {
  it('records a success with the route clinic and what the result describes', async () => {
    const { telemetry, interceptor } = setup();
    const result = { request: { requestType: 'RESCHEDULE_APPOINTMENT' } };

    await expect(
      lastValueFrom(
        interceptor.intercept(contextFor('confirm', { params: { clinicId: 'clinic-1' } }), {
          handle: () => of(result),
        }),
      ),
    ).resolves.toBe(result);

    expect(telemetry.record).toHaveBeenCalledWith(
      'appointment.request.confirm',
      expect.objectContaining({
        clinicId: 'clinic-1',
        kind: 'RESCHEDULE',
        outcome: 'SUCCEEDED',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('records a failure with its code and passes the error through untouched', async () => {
    const { telemetry, interceptor } = setup();
    const error = new ConflictException({ code: 'APPOINTMENT_INVALID_TRANSITION' });

    await expect(
      lastValueFrom(
        interceptor.intercept(contextFor('confirm', { params: { clinicId: 'clinic-1' } }), {
          handle: () => throwError(() => error),
        }),
      ),
    ).rejects.toBe(error);

    expect(telemetry.record).toHaveBeenCalledWith(
      'appointment.request.confirm',
      expect.objectContaining({ outcome: 'FAILED', reason: 'APPOINTMENT_INVALID_TRANSITION' }),
    );
  });

  it('takes the clinic from the result, then the guard, when the route has none', async () => {
    const { telemetry, interceptor } = setup();
    await lastValueFrom(
      interceptor.intercept(contextFor('claim', { params: {} }), {
        handle: () => of({ clinicId: 'clinic-9' }),
      }),
    );
    await lastValueFrom(
      interceptor.intercept(contextFor('confirm', { params: {}, clinicId: 'clinic-3' }), {
        handle: () => of({}),
      }),
    );

    await lastValueFrom(
      interceptor.intercept(
        contextFor('confirm', { params: {}, query: { clinicId: 'clinic-5' } }),
        {
          handle: () => of({}),
        },
      ),
    );

    // The last is /sync/push, which names its clinic in the query string.
    expect(telemetry.record.mock.calls.map(([, input]) => input.clinicId)).toEqual([
      'clinic-9',
      'clinic-3',
      'clinic-5',
    ]);
  });

  it('leaves an undecorated route alone', async () => {
    const { telemetry, interceptor } = setup();
    await lastValueFrom(
      interceptor.intercept(contextFor('untracked', { params: {} }), { handle: () => of(1) }),
    );
    expect(telemetry.record).not.toHaveBeenCalled();
  });
});

describe('track descriptors', () => {
  it('maps a request type to its kind, whether wrapped or bare', () => {
    expect(appointmentRequestKind({ requestType: 'NEW_APPOINTMENT' })).toEqual({ kind: 'NEW' });
    expect(appointmentRequestKind({ request: { requestType: 'CANCEL_APPOINTMENT' } })).toEqual({
      kind: 'CANCEL',
    });
    expect(appointmentRequestKind({})).toEqual({});
  });

  it('counts what a merge preview found', () => {
    expect(mergePreviewShape({ blockers: [{}], warnings: [{}, {}] })).toEqual({
      blocked: true,
      blockerCount: 1,
      warningCount: 2,
    });
  });

  it('reports whether an invitation reached an account and an inbox, never the address', () => {
    const shape = portalInviteShape({
      email: 'ama@example.com',
      identity: { status: 'PROVISIONED' },
      emailDelivery: { status: 'SENT' },
    });
    expect(shape).toEqual({ identity: 'PROVISIONED', delivery: 'SENT' });
    expect(
      portalInviteShape({ identity: { status: 'NOT_REQUESTED' }, emailDelivery: null }),
    ).toEqual({ identity: 'NOT_REQUESTED', delivery: 'NOT_SENT' });
  });
});

/**
 * Every server event in the catalog is emitted somewhere, and every emitted name is in the
 * catalog. A documented event nobody records is a dashboard row that is always zero.
 */
describe('telemetry coverage', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [readFileSync(path, 'utf8')] : [];
    });
  }

  const code = sources(join(__dirname, '..')).join('\n');
  const emitted = new Set(
    [...code.matchAll(/(?:@Track\(|\.record\(|\.track\()\s*'([a-z_.]+)'/g)].map(
      (match) => match[1],
    ),
  );

  it.each(
    (Object.keys(TELEMETRY_EVENTS) as TelemetryEventName[]).filter(
      (name) => !('client' in TELEMETRY_EVENTS[name]),
    ),
  )('emits %s', (name) => {
    expect(emitted.has(name)).toBe(true);
  });

  it('emits nothing the catalog does not define', () => {
    expect([...emitted].filter((name) => !(name in TELEMETRY_EVENTS))).toEqual([]);
  });
});
