import {
  describeEmailAvailability,
  deliveryLatencyMs,
  explainFailure,
  explainTerminalStatus,
  formatDeliveryLatency,
  formatFailureReason,
  formatTemplateLabel,
  getStatusVariant,
  medianDeliveryLatencyMs,
  type DeliveryTimings,
} from './notification-delivery';

describe('explainFailure', () => {
  it('reads the code before the colon, since the suffix is provider detail', () => {
    // Codes are stored as CODE:detail — a Twilio error number, an appointment status,
    // a template key. None of those mean anything to the person reading the row.
    expect(explainFailure('DELIVERY_FAILED:30008')?.label).toBe('Not delivered');
    expect(explainFailure('APPOINTMENT_NOT_CONFIRMED:CANCELLED')?.label).toBe(
      'Appointment not confirmed',
    );
    expect(explainFailure('TEMPLATE_NOT_FOUND:REMOVED_V9')?.label).toBe('Template missing');
  });

  it('gives every code an operator can act on a recovery action', () => {
    for (const code of [
      'NO_CONTACT_METHOD',
      'EMAIL_NOT_CONFIGURED',
      'EMAIL_CHANNEL_UNAVAILABLE',
      'EMAIL_SEND_FAILED',
      'QUEUE_UNAVAILABLE',
      'SEND_FAILED',
    ]) {
      expect(explainFailure(code)?.recovery).toBeTruthy();
    }
  });

  it('offers no false hope for outcomes nobody can retry', () => {
    // A reminder suppressed because its appointment was cancelled is working as
    // intended; telling staff to "try again" would send them chasing a non-problem.
    for (const code of [
      'APPOINTMENT_CANCELLED',
      'APPOINTMENT_COMPLETED',
      'APPOINTMENT_NO_SHOW',
      'APPOINTMENT_RESCHEDULED',
      'APPOINTMENT_NOT_FOUND',
    ]) {
      expect(explainFailure(code)?.recovery).toBeNull();
      expect(explainFailure(code)?.detail).toBeTruthy();
    }
  });

  it('degrades to a readable sentence for a code it has never seen', () => {
    // A code added by a later API deploy must not render as raw SCREAMING_SNAKE.
    const explanation = explainFailure('SOME_FUTURE_PROBLEM');
    expect(explanation?.label).toBe('Some future problem');
    expect(explanation?.detail).toBeTruthy();
  });

  it.each([null, undefined, ''])('returns nothing for %p', (value) => {
    expect(explainFailure(value)).toBeNull();
    expect(formatFailureReason(value)).toBe('');
  });
});

describe('getStatusVariant', () => {
  it.each([
    ['DELIVERED', 'finalized'],
    ['SENT', 'secondary'],
    ['FAILED', 'destructive'],
    ['QUEUED', 'draft'],
    ['SOMETHING_ELSE', 'draft'],
  ])('maps %s to the %s badge', (status, expected) => {
    expect(getStatusVariant(status)).toBe(expected);
  });
});

describe('formatTemplateLabel', () => {
  it('names every template the ledger can hold', () => {
    expect(formatTemplateLabel('PORTAL_INVITE_V1')).toBe('Portal invite');
    expect(formatTemplateLabel('APPOINTMENT_CANCELLED_V1')).toBe('Appointment cancelled');
    expect(formatTemplateLabel('STAFF_ACCOUNT_DEACTIVATED_V1')).toBe('Account deactivated');
  });

  it('strips the version suffix from a template it does not know', () => {
    expect(formatTemplateLabel('BRAND_NEW_THING_V2')).toBe('Brand new thing');
  });
});

describe('explainTerminalStatus', () => {
  it('explains why email never reaches delivered', () => {
    // The defect this guards: the Delivered metric is fed only by the SMS provider
    // callback, so an operator comparing channels concludes email is broken.
    expect(explainTerminalStatus('EMAIL')).toContain('no delivery receipt');
    expect(explainTerminalStatus('SMS')).toBeNull();
  });
});

describe('describeEmailAvailability', () => {
  it('stays silent when email genuinely works', () => {
    expect(
      describeEmailAvailability({
        available: true,
        readiness: 'smtp',
        missingVars: [],
        fromAddress: 'info@akomapa.org',
      }),
    ).toBeNull();
  });

  it('names the missing settings rather than saying email is broken', () => {
    const notice = describeEmailAvailability({
      available: false,
      readiness: 'unconfigured',
      missingVars: ['SMTP_HOST', 'EMAIL_FROM'],
      fromAddress: null,
    });

    expect(notice?.tone).toBe('warning');
    expect(notice?.detail).toContain('SMTP_HOST, EMAIL_FROM');
    expect(notice?.detail).toContain('recorded as failed');
  });

  it('distinguishes test mode from a broken configuration', () => {
    // The fake provider is the correct setup locally and in CI. Showing it as a
    // failure would make the warning meaningless everywhere it matters.
    const notice = describeEmailAvailability({
      available: true,
      readiness: 'fake',
      missingVars: [],
      fromAddress: null,
    });

    expect(notice?.tone).toBe('info');
    expect(notice?.title).toContain('test mode');
  });

  it('shows nothing before the status has loaded', () => {
    expect(describeEmailAvailability(null)).toBeNull();
  });
});

describe('delivery latency', () => {
  const row = (overrides: Partial<DeliveryTimings> = {}): DeliveryTimings => ({
    status: 'SENT',
    createdAt: '2026-03-21T09:00:00.000Z',
    scheduledAt: '2026-03-21T09:00:00.000Z',
    sentAt: '2026-03-21T09:00:12.000Z',
    ...overrides,
  });

  it('measures from when the message became eligible, not when the row was made', () => {
    // The defect this guards: a reminder scheduled for tomorrow is not a day late when it goes
    // out tomorrow. Measuring from createdAt would bury the queue delay under the intended wait.
    const scheduled = row({
      createdAt: '2026-03-20T09:00:00.000Z',
      scheduledAt: '2026-03-21T09:00:00.000Z',
      sentAt: '2026-03-21T09:00:05.000Z',
    });

    expect(deliveryLatencyMs(scheduled)).toBe(5_000);
  });

  it('measures from creation when the message was queued to go immediately', () => {
    expect(deliveryLatencyMs(row())).toBe(12_000);
  });

  it('has no latency for a message that has not been sent', () => {
    expect(deliveryLatencyMs(row({ status: 'QUEUED', sentAt: null }))).toBeNull();
  });

  it('clamps clock skew to zero rather than reporting a negative duration', () => {
    expect(deliveryLatencyMs(row({ sentAt: '2026-03-21T08:59:59.000Z' }))).toBe(0);
  });

  it('returns null for an unparseable timestamp instead of NaN', () => {
    expect(deliveryLatencyMs(row({ sentAt: 'not a date' }))).toBeNull();
  });

  it('takes the median so one stuck message cannot misrepresent a session', () => {
    const rows = [
      row({ sentAt: '2026-03-21T09:00:01.000Z' }),
      row({ sentAt: '2026-03-21T09:00:02.000Z' }),
      row({ sentAt: '2026-03-21T09:01:00.000Z' }),
    ];

    // The mean would be ~21s. The typical message took 2.
    expect(medianDeliveryLatencyMs(rows)).toBe(2_000);
  });

  it('averages the middle pair for an even count', () => {
    const rows = [
      row({ sentAt: '2026-03-21T09:00:02.000Z' }),
      row({ sentAt: '2026-03-21T09:00:04.000Z' }),
    ];

    expect(medianDeliveryLatencyMs(rows)).toBe(3_000);
  });

  it('ignores unsent rows when taking the median', () => {
    const rows = [row({ sentAt: '2026-03-21T09:00:02.000Z' }), row({ sentAt: null })];
    expect(medianDeliveryLatencyMs(rows)).toBe(2_000);
  });

  it('has no median when nothing has been sent', () => {
    expect(medianDeliveryLatencyMs([row({ sentAt: null })])).toBeNull();
    expect(medianDeliveryLatencyMs([])).toBeNull();
  });

  it.each([
    [null, '\u2014'],
    [400, 'under a second'],
    [1_400, '1s'],
    [45_000, '45s'],
    [60_000, '1m'],
    [95_000, '1m 35s'],
  ])('formats %p as %p', (ms, expected) => {
    expect(formatDeliveryLatency(ms as number | null)).toBe(expected);
  });
});
