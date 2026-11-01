/**
 * Consent for optional cookies and storage.
 *
 * Nkwapa needs only first-party storage to work (sign-in, the active clinic, offline records),
 * and that never asks. The one optional category is analytics, which also has to be switched on
 * for the deployment. Until someone says yes, nothing optional is set or sent; a decline is
 * remembered the same way as a yes.
 */

export const COOKIE_CONSENT_KEY = 'nkwapa.cookie-consent';
/** Raised when the choice changes, and to ask the banner to open its settings. */
export const COOKIE_CONSENT_EVENT = 'nkwapa:cookie-consent';
export const OPEN_COOKIE_SETTINGS_EVENT = 'nkwapa:open-cookie-settings';
/** Bump when the categories change, so everyone is asked again. */
export const COOKIE_CONSENT_VERSION = 1;

export interface CookieConsent {
  analytics: boolean;
  version: number;
  decidedAt: string;
}

/** Whether this deployment has any optional storage to ask about at all. */
export function optionalCookiesInUse(): boolean {
  return process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';
}

export function parseCookieConsent(raw: string | null): CookieConsent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CookieConsent>;
    if (value.version !== COOKIE_CONSENT_VERSION || typeof value.analytics !== 'boolean') {
      return null;
    }
    return {
      analytics: value.analytics,
      version: value.version,
      decidedAt: String(value.decidedAt ?? ''),
    };
  } catch {
    return null;
  }
}

export function readCookieConsent(): CookieConsent | null {
  try {
    return parseCookieConsent(window.localStorage.getItem(COOKIE_CONSENT_KEY));
  } catch {
    return null;
  }
}

export function saveCookieConsent(analytics: boolean): CookieConsent {
  const consent = {
    analytics,
    version: COOKIE_CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
  } catch {
    // Storage blocked: the choice holds for this page only, and analytics stays off next time.
  }
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: consent }));
  return consent;
}

/** Analytics may run: the deployment uses it and this person said yes. */
export function analyticsConsented(): boolean {
  return optionalCookiesInUse() && readCookieConsent()?.analytics === true;
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
