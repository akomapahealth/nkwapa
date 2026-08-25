import { scrubBrowserEvent, scrubClinicalUrl } from './sentry-scrubbing';

const PATIENT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('scrubbing a browser error report', () => {
  it('keeps the route shape but not the patient', () => {
    expect(scrubClinicalUrl(`/clinics/${PATIENT}/patients/${PATIENT}?tab=notes`)).toBe(
      '/clinics/:id/patients/:id',
    );
  });

  it('leaves a route with no identifier alone', () => {
    expect(scrubClinicalUrl('/dashboard')).toBe('/dashboard');
  });

  it('scrubs navigation breadcrumbs, which record where a clinician went', () => {
    const event = scrubBrowserEvent({
      breadcrumbs: [{ data: { from: `/patients/${PATIENT}`, to: `/encounters/${PATIENT}` } }],
    });

    expect(event.breadcrumbs?.[0].data?.from).toBe('/patients/:id');
    expect(event.breadcrumbs?.[0].data?.to).toBe('/encounters/:id');
  });

  it('keeps the actor id and nothing else about them', () => {
    expect(scrubBrowserEvent({ user: { id: 'user-1', email: 'nurse@example.com' } }).user).toEqual({
      id: 'user-1',
    });
  });
});
