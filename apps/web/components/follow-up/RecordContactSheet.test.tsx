/** @jest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { apiFetch } from '@/lib/api';
import type { ContactDetail } from '@/lib/follow-up-contacts';
import { DIABETES_URGENT_SYMPTOM_LABELS } from '@nkwapa/db/diabetes-interview';
import { RecordContactSheet } from './RecordContactSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no matchMedia; a wide screen opens the sheet from the right.
window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof window.matchMedia;

const CONTACT: ContactDetail = {
  id: 'c1',
  mode: 'PHONE',
  purpose: 'ROUTINE',
  status: 'DUE',
  dueOn: '2026-11-18',
  daysOverdue: 0,
  completedAt: null,
  owner: null,
  attemptCount: 0,
  lastAttempt: null,
  patient: {
    id: 'p1',
    patientCode: 'NK-1',
    name: 'Ama Mensah',
    phoneE164: '+233201234567',
    tier: 'HIGH',
  },
  suggestedNextOn: '2026-12-18',
  asksDiabetes: true,
  location: null,
};

jest.mock('@/lib/auth-context', () => ({ useAuth: () => async () => 'token' }));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), apiFetch: jest.fn() }));
jest.mock('@/lib/bootstrap-context', () => ({
  useBootstrap: () => ({ bootstrap: { userId: 'u1', displayName: 'Abena' } }),
}));
jest.mock('@/lib/use-async-resource', () => ({
  useAsyncResource: () => ({ data: CONTACT, error: null, isOnline: true }),
}));

const fetchMock = apiFetch as jest.Mock;

function renderSheet(onRecorded = jest.fn()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() =>
    createRoot(host).render(
      createElement(RecordContactSheet, {
        clinicId: 'k1',
        contactId: 'c1',
        online: true,
        onClose: jest.fn(),
        onRecorded,
      }),
    ),
  );
  return onRecorded;
}

// The segmented control draws its label twice (a masked copy for the colour wipe).
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === name || b.textContent === `${name}${name}`,
  )!;

afterEach(() => {
  document.body.innerHTML = '';
  fetchMock.mockReset();
});

describe('record a follow-up contact (#338)', () => {
  it('offers a tap-to-call link to the patient', () => {
    renderSheet();
    const call = document.body.querySelector('a[href^="tel:"]');
    expect(call?.getAttribute('href')).toBe('tel:+233201234567');
  });

  it('saves "not reached" in two taps, under an id made on the device', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'a1', contactStatus: 'DUE', urgent: false }),
    });
    const onRecorded = renderSheet();
    act(() => button('Not reached').click());
    await act(async () => button('No answer').click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/clinics/k1/follow-up/contacts/c1/attempts');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      mode: 'PHONE',
      outcome: 'ATTEMPTED',
      notReachedReason: 'NO_ANSWER',
    });
    expect(init.idempotencyKey).toBe(`follow-up-attempt-${body.id}`);
    expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({ contactStatus: 'DUE' }));
  });

  it('warns that a danger sign raises an urgent flag before it is saved', () => {
    renderSheet();
    act(() => button('Reached them').click());
    expect(document.body.querySelector('[data-testid="contact-urgent"]')).toBeNull();
    const chestPain = [...document.body.querySelectorAll('label')].find(
      (label) => label.textContent?.trim() === 'Chest pain',
    )!;
    act(() => chestPain.click());
    expect(document.body.querySelector('[data-testid="contact-urgent"]')?.textContent).toBe(
      'Urgent: they need to be seen today.',
    );
  });

  it('asks the diabetes danger signs when they have diabetes, and warns on one', () => {
    renderSheet();
    act(() => button('Reached them').click());
    const vomiting = [...document.body.querySelectorAll('label')].find(
      (label) => label.textContent?.trim() === DIABETES_URGENT_SYMPTOM_LABELS.VOMITING,
    )!;
    act(() => vomiting.click());
    expect(document.body.querySelector('[data-testid="contact-urgent"]')).not.toBeNull();
  });
});
