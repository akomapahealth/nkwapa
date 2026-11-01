import type { PostHog } from 'posthog-js';

/**
 * PostHog, loaded only after someone accepts analytics cookies.
 *
 * The SDK is imported on first use, so nobody who declines downloads it. Everything automatic is
 * off (clicks, pageviews, replay, surveys, flags, remote scripts), so the only events sent are the
 * allow-listed ones trackEvent passes in. Workspace URLs can carry patient and visit ids, so
 * before_send drops every URL, referrer and title property except on public landing events.
 */

const URL_PROPERTIES = [
  '$current_url',
  '$pathname',
  '$host',
  '$referrer',
  '$referring_domain',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_host',
  '$initial_referrer',
  '$initial_referring_domain',
  '$title',
];

let loading: Promise<PostHog | null> | null = null;

export function loadPostHog(): Promise<PostHog | null> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined') return Promise.resolve(null);

  loading ??= import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        rageclick: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_web_experiments: true,
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
        person_profiles: 'never',
        mask_personal_data_properties: true,
        before_send: stripUrls,
      });
      return posthog;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  // Callers have already checked consent, so a yes after an earlier withdrawal opts back in.
  return loading.then((posthog) => {
    if (posthog?.has_opted_out_capturing()) {
      posthog.set_config({ disable_persistence: false });
      posthog.opt_in_capturing({ captureEventName: false });
    }
    return posthog;
  });
}

/** Stop sending, and delete PostHog's cookie and storage, once someone withdraws consent. */
export function withdrawPostHog(): void {
  void loading
    ?.then((posthog) => {
      if (!posthog) return;
      posthog.opt_out_capturing();
      // Persistence off first, so nothing writes the identifier back after it is cleared.
      posthog.set_config({ disable_persistence: true });
      posthog.persistence?.clear();
      posthog.sessionPersistence?.clear();
      // Tab-scoped window markers live outside both persistence stores.
      for (const key of Object.keys(window.sessionStorage)) {
        if (key.startsWith('ph_')) window.sessionStorage.removeItem(key);
      }
    })
    .catch(() => undefined); // Blocked storage must not surface as an unhandled rejection.
}

export function stripUrls<T extends { event: string; properties: Record<string, unknown> }>(
  event: T | null,
): T | null {
  if (!event || event.event.startsWith('landing.')) return event;
  for (const key of URL_PROPERTIES) delete event.properties[key];
  return event;
}
