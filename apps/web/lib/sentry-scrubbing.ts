/**
 * Remove patient identifiers from a browser error report.
 *
 * Clinical routes put a patient id and an encounter id straight in the path, so an untouched
 * error report names the patient a clinician was looking at. Replacing the identifier keeps the
 * route shape, which is the part that is actually useful for debugging.
 */
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$|\?)/gi;

export function scrubClinicalUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const [path] = url.split('?');
  return path.replace(UUID_SEGMENT, '/:id');
}

export interface ScrubbableBrowserEvent {
  request?: { url?: string; query_string?: unknown; data?: unknown };
  user?: Record<string, unknown>;
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
}

export function scrubBrowserEvent<T extends ScrubbableBrowserEvent>(event: T): T {
  if (event.request) {
    event.request.url = scrubClinicalUrl(event.request.url);
    // A query string on a clinical route carries search terms and filters typed by a clinician.
    delete event.request.query_string;
    delete event.request.data;
  }

  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.data && typeof breadcrumb.data.url === 'string') {
      breadcrumb.data.url = scrubClinicalUrl(breadcrumb.data.url);
    }
    if (breadcrumb.data && 'from' in breadcrumb.data && typeof breadcrumb.data.from === 'string') {
      breadcrumb.data.from = scrubClinicalUrl(breadcrumb.data.from);
    }
    if (breadcrumb.data && 'to' in breadcrumb.data && typeof breadcrumb.data.to === 'string') {
      breadcrumb.data.to = scrubClinicalUrl(breadcrumb.data.to);
    }
  }

  return event;
}
