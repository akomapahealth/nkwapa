import {
  TELEMETRY_EVENTS,
  sanitizeTelemetry,
  type TelemetryEventName,
  type TelemetryProperties,
} from '@nkwapa/db/telemetry-events';

/**
 * Browser analytics, held to the same allow-list as the API's telemetry.
 *
 * Only events the shared catalog marks `client` can be sent from here, and their properties pass
 * the catalog's sanitizer first, so a provider script on the page can never be handed a name, a
 * patient identifier, or anything else the catalog does not name. Nothing is sent unless
 * NEXT_PUBLIC_ANALYTICS_ENABLED is 'true', and even then only to a provider already loaded on the
 * page (Google tag or PostHog). Product metrics that must be reliable are recorded server-side.
 */

type ClientEvents = {
  [K in TelemetryEventName]: (typeof TELEMETRY_EVENTS)[K] extends { client: true } ? K : never;
}[TelemetryEventName];

export type AnalyticsEventName = ClientEvents;

export interface AnalyticsPayload {
  name: AnalyticsEventName;
  properties: TelemetryProperties;
}

function analyticsEnabled(): boolean {
  return typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';
}

/** The exact payload a provider would receive, or null for an event the browser may not send. */
export function buildAnalyticsPayload(
  name: AnalyticsEventName,
  properties: Record<string, unknown> = {},
): AnalyticsPayload | null {
  const definition: { client?: boolean } = TELEMETRY_EVENTS[name];
  if (!definition?.client) return null;
  const sanitized = sanitizeTelemetry(name, properties);
  if (!sanitized) return null;
  return { name, properties: sanitized.properties };
}

export function trackEvent(name: AnalyticsEventName, properties?: Record<string, unknown>): void {
  if (!analyticsEnabled()) return;
  const payload = buildAnalyticsPayload(name, properties);
  if (!payload) return;

  const target = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    posthog?: { capture: (name: string, properties?: object) => void };
  };
  try {
    target.gtag?.('event', payload.name, payload.properties);
    target.posthog?.capture(payload.name, payload.properties);
  } catch {
    // A provider script failing must never break the page that called it.
  }

  if (process.env.NODE_ENV === 'development') {
    console.debug('[Analytics]', payload.name, payload.properties);
  }
}

/**
 * A/B test variant selection. Uses a deterministic hash of userId + experimentId.
 * When no userId, uses sessionStorage to persist variant for the session.
 */
export function getAbVariant(experimentId: string, variants: string[], userId?: string): string {
  if (typeof window === 'undefined') return variants[0] ?? 'control';

  const storageKey = `ab_${experimentId}`;
  const stored = sessionStorage.getItem(storageKey);
  if (stored && variants.includes(stored)) return stored;

  const seed = userId ?? `anon_${Date.now()}_${Math.random()}`;
  const hash = seed.split('').reduce((acc, c) => {
    return (acc * 31 + c.charCodeAt(0)) >>> 0;
  }, 0);
  const variant = variants[hash % variants.length] ?? variants[0];
  sessionStorage.setItem(storageKey, variant);
  return variant;
}
