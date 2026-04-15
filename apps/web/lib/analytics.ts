/**
 * Landing page analytics and A/B testing.
 * Configure your analytics provider (e.g. PostHog, Vercel Analytics, GA4) via env vars.
 */

export type AnalyticsEvent = {
  name: string;
  properties?: Record<string, string | number | boolean>;
};

const ANALYTICS_ENABLED =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';

/**
 * Track a custom event. Extend this to send to your analytics provider.
 */
export function trackEvent(event: AnalyticsEvent): void {
  if (!ANALYTICS_ENABLED) return;

  if (typeof window !== 'undefined' && 'gtag' in window) {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
      'event',
      event.name,
      event.properties,
    );
  }

  if (typeof window !== 'undefined' && 'posthog' in window) {
    (
      window as unknown as { posthog: { capture: (n: string, p?: object) => void } }
    ).posthog.capture(event.name, event.properties);
  }

  if (process.env.NODE_ENV === 'development') {
    console.debug('[Analytics]', event.name, event.properties);
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
