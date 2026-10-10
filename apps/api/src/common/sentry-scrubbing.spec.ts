import { scrubEventUrl, scrubSentryEvent } from './sentry-scrubbing';

const PATIENT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('scrubbing an error report', () => {
  it('keeps the route shape but not the patient', () => {
    expect(scrubEventUrl(`/clinics/${PATIENT}/patients/${PATIENT}/chart/vitals`)).toBe(
      '/clinics/:id/patients/:id/chart/vitals',
    );
  });

  it('drops a query string, which carries what a clinician typed', () => {
    expect(scrubEventUrl('/patients?search=Ama+Mensah')).toBe('/patients?[redacted]');
  });

  it('removes the request body outright', () => {
    // A request body on this API is a clinical record. There is no version worth keeping.
    const event = scrubSentryEvent({
      request: {
        url: `/clinics/${PATIENT}/patients`,
        data: { firstName: 'Ama', nationalId: 'GHA-123456789-0' },
        query_string: 'search=Ama',
        cookies: 'session=abc',
        headers: { authorization: 'Bearer token', 'user-agent': 'Nkwapa/1.0' },
      },
    });

    expect(event.request?.data).toBeUndefined();
    expect(event.request?.query_string).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers?.authorization).toBeUndefined();
    // Diagnostics that identify nobody are kept.
    expect(event.request?.headers?.['user-agent']).toBe('Nkwapa/1.0');
  });

  it('redacts contact details quoted in an exception', () => {
    const event = scrubSentryEvent({
      exception: {
        values: [{ value: 'Duplicate patient for ama@example.com on +233200000001' }],
      },
    });

    const value = event.exception?.values?.[0].value ?? '';
    expect(value).not.toContain('ama@example.com');
    expect(value).not.toContain('233200000001');
  });

  it('keeps the actor id and nothing else about them', () => {
    // The id is enough to find the actor in the audit log; the rest identifies a person.
    const event = scrubSentryEvent({
      user: { id: 'user-1', email: 'nurse@example.com', ip_address: '203.0.113.9' },
    });

    expect(event.user).toEqual({ id: 'user-1' });
  });

  it('scrubs breadcrumbs, which are where a URL usually survives', () => {
    const event = scrubSentryEvent({
      breadcrumbs: [
        { message: 'Fetched patient ama@example.com', data: { url: `/patients/${PATIENT}` } },
      ],
    });

    expect(event.breadcrumbs?.[0].message).not.toContain('ama@example.com');
    expect(event.breadcrumbs?.[0].data?.url).toBe('/patients/:id');
  });

  it('leaves an event with nothing sensitive untouched', () => {
    expect(scrubSentryEvent({ message: 'Database connection lost' }).message).toBe(
      'Database connection lost',
    );
  });
});
