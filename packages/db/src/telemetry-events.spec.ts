import {
  TELEMETRY_CATEGORIES,
  TELEMETRY_EVENTS,
  TELEMETRY_FUNNELS,
  isTelemetryEventName,
  isTelemetryReasonCode,
  sanitizeTelemetry,
  type TelemetryEventName,
} from './telemetry-events';

describe('telemetry event catalog', () => {
  const names = Object.keys(TELEMETRY_EVENTS) as TelemetryEventName[];

  it('names every event domain.object.action in lower case', () => {
    for (const name of names) {
      expect(name).toMatch(/^[a-z]+(\.[a-z_]+){1,2}$/);
    }
  });

  it('gives every event a known category and a description', () => {
    for (const name of names) {
      expect(TELEMETRY_CATEGORIES).toContain(TELEMETRY_EVENTS[name].category);
      expect(TELEMETRY_EVENTS[name].description.length).toBeGreaterThan(10);
    }
  });

  // A property whose name suggests a person would be a leak waiting for a value.
  it('declares no property that could identify a person', () => {
    const forbidden = /name|email|phone|dob|birth|national|address|patientId|userId|note|message/i;
    for (const name of names) {
      for (const key of Object.keys(TELEMETRY_EVENTS[name].properties ?? {})) {
        expect(key).not.toMatch(forbidden);
      }
    }
  });

  it('builds every funnel from server events in the catalog', () => {
    for (const funnel of TELEMETRY_FUNNELS) {
      expect(funnel.steps.length).toBeGreaterThanOrEqual(2);
      for (const step of funnel.steps) {
        expect(isTelemetryEventName(step.event)).toBe(true);
        expect(TELEMETRY_EVENTS[step.event]).not.toHaveProperty('client', true);
      }
    }
    expect(new Set(TELEMETRY_FUNNELS.map((funnel) => funnel.id)).size).toBe(
      TELEMETRY_FUNNELS.length,
    );
  });

  it('recognises only catalog events', () => {
    expect(isTelemetryEventName('portal.claim')).toBe(true);
    expect(isTelemetryEventName('toString')).toBe(false);
    expect(sanitizeTelemetry('made.up.event', {})).toBeNull();
  });
});

describe('sanitizeTelemetry', () => {
  it('keeps what the event allows', () => {
    expect(
      sanitizeTelemetry('appointment.request.confirm', {
        kind: 'RESCHEDULE',
        outcome: 'SUCCEEDED',
        durationMs: 42,
      }),
    ).toEqual({
      event: 'appointment.request.confirm',
      category: 'appointments',
      reason: null,
      bucket: null,
      properties: { kind: 'RESCHEDULE', outcome: 'SUCCEEDED', durationMs: 42 },
      dropped: [],
    });
  });

  it('drops anything not on the allow-list and says which keys, never their values', () => {
    const result = sanitizeTelemetry('portal.claim', {
      outcome: 'FAILED',
      email: 'ama@example.com',
      patientId: '1f0c',
      dob: '1990-01-01',
    });
    expect(result?.properties).toEqual({ outcome: 'FAILED' });
    expect(result?.dropped.sort()).toEqual(['dob', 'email', 'patientId']);
    expect(JSON.stringify(result)).not.toContain('ama@example.com');
  });

  it('refuses a value outside its rule', () => {
    const result = sanitizeTelemetry('appointment.request.submit', {
      kind: 'Ama wants Tuesday',
      durationMs: -5,
      outcome: 'MAYBE',
    });
    expect(result?.properties).toEqual({});
    expect(result?.dropped.sort()).toEqual(['durationMs', 'kind', 'outcome']);
  });

  it('bounds counts', () => {
    expect(sanitizeTelemetry('sync.push', { mutations: 501 })?.properties).toEqual({});
    expect(sanitizeTelemetry('sync.push', { mutations: 1.5 })?.properties).toEqual({});
    expect(sanitizeTelemetry('sync.push', { mutations: 200 })?.properties).toEqual({
      mutations: 200,
    });
  });

  // An exception message can carry anything; only a machine code survives as a reason.
  it('accepts a reason only when it is a machine code', () => {
    expect(isTelemetryReasonCode('APPOINTMENT_INVALID_TRANSITION')).toBe(true);
    expect(sanitizeTelemetry('portal.claim', { reason: 'INVITE_EXPIRED' })?.reason).toBe(
      'INVITE_EXPIRED',
    );
    const leaky = sanitizeTelemetry('portal.claim', {
      reason: 'No invite for ama@example.com',
    });
    expect(leaky?.reason).toBeNull();
    expect(leaky?.dropped).toEqual(['reason']);
  });

  it('lets only the rate-limit event name its bucket', () => {
    expect(sanitizeTelemetry('security.rate_limit', { bucket: 'sync_push' })?.bucket).toBe(
      'sync_push',
    );
    expect(sanitizeTelemetry('security.rate_limit', { bucket: '/patients?q=Ama' })?.bucket).toBe(
      null,
    );
    expect(sanitizeTelemetry('portal.claim', { bucket: 'sync_push' })?.dropped).toEqual(['bucket']);
  });

  it('ignores absent values rather than reporting them as dropped', () => {
    expect(
      sanitizeTelemetry('portal.claim', { reason: undefined, outcome: null })?.dropped,
    ).toEqual([]);
  });
});
