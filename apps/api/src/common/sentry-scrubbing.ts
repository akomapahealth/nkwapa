import { redactLogValue, redactUrl } from './redaction';

/**
 * Strip patient data from an error report before it leaves the building.
 *
 * Sentry's Node integration attaches request context to an event automatically. On a clinical API
 * that means a URL carrying a patient id, a query string, and an exception message that may quote
 * a record. Nothing was scrubbing any of it.
 *
 * Written as a plain function over a minimal event shape so it can be tested without initializing
 * Sentry, and so the rules live next to the other redaction rules rather than inside a callback.
 */
export interface ScrubbableEvent {
  message?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    headers?: Record<string, unknown>;
    cookies?: unknown;
  };
  exception?: {
    values?: Array<{ value?: string }>;
  };
  user?: Record<string, unknown>;
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown> }>;
}

/** Identifier-shaped path segments become placeholders, so a URL cannot name a patient. */
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

export function scrubEventUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const withoutQuery = redactUrl(url) ?? url;
  return withoutQuery.replace(UUID_SEGMENT, '/:id');
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.message) {
    event.message = redactLogValue(event.message);
  }

  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = redactLogValue(value.value);
  }

  if (event.request) {
    event.request.url = scrubEventUrl(event.request.url);
    // A request body on this API is a clinical record. There is no version of it worth keeping.
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
      delete event.request.headers['x-clinic-id'];
    }
  }

  if (event.user) {
    // The internal user id is enough to find the actor in the audit log; the rest identifies them.
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = redactLogValue(breadcrumb.message);
    if (breadcrumb.data && typeof breadcrumb.data.url === 'string') {
      breadcrumb.data.url = scrubEventUrl(breadcrumb.data.url);
    }
  }

  return event;
}
