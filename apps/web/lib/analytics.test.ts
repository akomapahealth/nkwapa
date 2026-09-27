import { buildAnalyticsPayload, trackEvent, type AnalyticsEventName } from './analytics';

describe('buildAnalyticsPayload', () => {
  it('passes only the properties the catalog allows', () => {
    expect(
      buildAnalyticsPayload('sync.center.open', {
        blocked: 2,
        queued: 5,
        patientName: 'Ama Mensah',
        clinicId: 'clinic-1',
      }),
    ).toEqual({ name: 'sync.center.open', properties: { blocked: 2, queued: 5 } });
  });

  it('refuses values outside their rule', () => {
    expect(buildAnalyticsPayload('landing.cta.click', { target: 'https://evil.example' })).toEqual({
      name: 'landing.cta.click',
      properties: {},
    });
  });

  it('refuses a server-only event even if a caller forces it through', () => {
    expect(buildAnalyticsPayload('portal.claim' as AnalyticsEventName, {})).toBeNull();
  });
});

describe('trackEvent', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;
  const originalWindow = (global as { window?: unknown }).window;

  afterEach(() => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = originalFlag;
    (global as { window?: unknown }).window = originalWindow;
  });

  function withProviders() {
    const gtag = jest.fn();
    const capture = jest.fn();
    (global as { window?: unknown }).window = { gtag, posthog: { capture } };
    return { gtag, capture };
  }

  it('sends nothing while analytics is disabled', () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = 'false';
    const { gtag, capture } = withProviders();
    trackEvent('landing.page.view');
    expect(gtag).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('sends the sanitized payload to each provider when enabled', () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = 'true';
    const { gtag, capture } = withProviders();
    trackEvent('sync.change.retry', { reason: 'DUPLICATE_NATIONAL_ID', email: 'ama@example.com' });
    expect(gtag).toHaveBeenCalledWith('event', 'sync.change.retry', {});
    expect(capture).toHaveBeenCalledWith('sync.change.retry', {});
  });

  it('survives a provider that throws', () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = 'true';
    (global as { window?: unknown }).window = {
      gtag: () => {
        throw new Error('blocked by the browser');
      },
    };
    expect(() => trackEvent('landing.page.view')).not.toThrow();
  });
});
