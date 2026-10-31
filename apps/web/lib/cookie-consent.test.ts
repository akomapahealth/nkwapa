import { COOKIE_CONSENT_VERSION, parseCookieConsent } from './cookie-consent';

describe('parseCookieConsent', () => {
  it('reads a saved choice', () => {
    const raw = JSON.stringify({
      analytics: false,
      version: COOKIE_CONSENT_VERSION,
      decidedAt: 'x',
    });
    expect(parseCookieConsent(raw)).toEqual({
      analytics: false,
      version: COOKIE_CONSENT_VERSION,
      decidedAt: 'x',
    });
  });

  it('asks again after the categories change, or when the value is unreadable', () => {
    expect(parseCookieConsent(JSON.stringify({ analytics: true, version: 0 }))).toBeNull();
    expect(parseCookieConsent(JSON.stringify({ analytics: 'yes', version: 1 }))).toBeNull();
    expect(parseCookieConsent('not json')).toBeNull();
    expect(parseCookieConsent(null)).toBeNull();
  });
});
