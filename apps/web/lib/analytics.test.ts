const mockLoadPostHog = jest.fn();
jest.mock('./posthog', () => ({
  ...jest.requireActual('./posthog'),
  loadPostHog: () => mockLoadPostHog(),
}));

import { buildAnalyticsPayload, trackEvent, type AnalyticsEventName } from './analytics';
import { stripUrls } from './posthog';

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
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  afterEach(() => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = originalFlag;
    (global as { window?: unknown }).window = originalWindow;
    mockLoadPostHog.mockReset();
  });

  function withConsent(analytics: boolean | null = true) {
    const value =
      analytics === null ? null : JSON.stringify({ analytics, version: 1, decidedAt: 'x' });
    (global as { window?: unknown }).window = { localStorage: { getItem: () => value } };
    const capture = jest.fn();
    mockLoadPostHog.mockResolvedValue({ capture });
    return capture;
  }

  it('sends nothing, and loads nothing, while analytics is disabled', async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = 'false';
    const capture = withConsent();
    trackEvent('landing.page.view');
    await flush();
    expect(mockLoadPostHog).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('loads nothing until the person accepts analytics cookies, or after they decline', async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = 'true';
    for (const choice of [null, false]) {
      const capture = withConsent(choice);
      trackEvent('landing.page.view');
      await flush();
      expect(mockLoadPostHog).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
    }
  });

  it('sends the sanitized payload to PostHog when enabled and accepted', async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = 'true';
    const capture = withConsent();
    trackEvent('sync.change.retry', { reason: 'DUPLICATE_NATIONAL_ID', email: 'ama@example.com' });
    await flush();
    expect(capture).toHaveBeenCalledWith('sync.change.retry', {});
  });

  it('survives PostHog failing to load', async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = 'true';
    withConsent();
    mockLoadPostHog.mockRejectedValue(new Error('blocked by the browser'));
    expect(() => trackEvent('landing.page.view')).not.toThrow();
    await flush();
  });
});

describe('stripUrls', () => {
  const urls = {
    $current_url: 'https://nkwapa.app/patients/abc/visits/123',
    $pathname: '/patients/abc',
    $referrer: 'https://nkwapa.app/queue',
    $initial_current_url: 'https://nkwapa.app/patients/abc',
    $title: 'Ama Mensah',
    $lib: 'web',
  };

  it('drops every URL, referrer and title property from workspace events', () => {
    const result = stripUrls({ event: 'sync.center.open', properties: { ...urls, queued: 2 } });
    expect(result?.properties).toEqual({ $lib: 'web', queued: 2 });
  });

  it('keeps them on public landing events', () => {
    const result = stripUrls({ event: 'landing.page.view', properties: { ...urls } });
    expect(result?.properties).toEqual(urls);
  });
});
