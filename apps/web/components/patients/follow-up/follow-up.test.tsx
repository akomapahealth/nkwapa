/** @jest-environment jsdom */
import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DangerSignNotice, readingNow } from './DangerSignNotice';
import { FollowUpTierBadge } from './FollowUpTierBadge';

const FLAG = 'NEXT_PUBLIC_FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED';
const original = process.env[FLAG];
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(element: ReactElement): HTMLElement {
  const host = document.createElement('div');
  act(() => createRoot(host).render(element));
  return host;
}

afterEach(() => {
  if (original === undefined) delete process.env[FLAG];
  else process.env[FLAG] = original;
});

describe('danger-sign notice (#336)', () => {
  beforeEach(() => {
    process.env[FLAG] = 'true';
  });

  it('says refer today for a crisis reading with a danger symptom', () => {
    const host = render(
      createElement(DangerSignNotice, {
        input: { readings: readingNow('186', '114'), symptoms: { hypertension: ['CHEST_PAIN'] } },
      }),
    );
    expect(host.querySelector('[data-testid="danger-sign-refer"]')?.textContent).toBe(
      'Refer today. Do not send the patient home.',
    );
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('asks for a repeat and the symptoms when none is ticked', () => {
    const host = render(
      createElement(DangerSignNotice, { input: { readings: readingNow(182, 100) } }),
    );
    expect(host.querySelector('[data-testid="danger-sign-repeat"]')).not.toBeNull();
    expect(host.textContent).toContain('Chest pain');
  });

  it('says nothing for an ordinary or half-typed reading, or with the flag off', () => {
    expect(
      render(createElement(DangerSignNotice, { input: { readings: readingNow('150', '95') } }))
        .textContent,
    ).toBe('');
    expect(readingNow('186', '')).toEqual([]);
    process.env[FLAG] = 'false';
    expect(
      render(createElement(DangerSignNotice, { input: { readings: readingNow(200, 120) } }))
        .textContent,
    ).toBe('');
  });
});

describe('tier badge', () => {
  it('names the tier for a screen reader and treats no tier as not yet tiered', () => {
    expect(render(createElement(FollowUpTierBadge, { tier: 'HIGH' })).textContent).toBe(
      'Follow-up tier: High',
    );
    const host = render(createElement(FollowUpTierBadge, { tier: null, stale: true }));
    expect(host.textContent).toBe('Follow-up tier: Not yet tiered (last known)');
    expect(host.querySelector('[data-tier="NOT_TIERED"]')).not.toBeNull();
  });
});

jest.mock('@/lib/auth-context', () => ({ useAuth: () => async () => 'token' }));
jest.mock('@/lib/api', () => ({ apiFetch: jest.fn() }));

describe('urgent flag banner (#337)', () => {
  const { UrgentFlagBanner } = require('./UrgentFlagBanner') as typeof import('./UrgentFlagBanner');
  const { apiFetch } = require('@/lib/api') as { apiFetch: jest.Mock };
  const base = {
    clinicId: 'c1',
    patientId: 'p1',
    reasons: ['DANGER_BP_WITH_SYMPTOMS' as const],
    userId: 'me',
  };
  const flag = {
    id: 'f1',
    kind: 'URGENT' as const,
    raisedAt: new Date().toISOString(),
    detail: null,
    acknowledgement: null,
  };

  it('offers "I\'m on it" and then names who took it', async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ userId: 'me', displayName: 'Kofi', at: new Date().toISOString() }),
    });
    const host = render(createElement(UrgentFlagBanner, { ...base, flag, canTake: true }));
    expect(host.textContent).toContain('Very high blood pressure with a danger symptom');
    const button = [...host.querySelectorAll('button')].find((b) => b.textContent === "I'm on it");
    await act(async () => button!.click());
    expect(apiFetch.mock.calls[0][0]).toBe('/clinics/c1/patients/p1/follow-up/acknowledge');
    expect(host.querySelector('[data-testid="urgent-flag-owner"]')?.textContent).toContain(
      "You're on it",
    );
  });

  it('shows a colleague as the owner, and no button to those who cannot take it', () => {
    const taken = render(
      createElement(UrgentFlagBanner, {
        ...base,
        flag: { ...flag, acknowledgement: { userId: 'k', displayName: 'Kofi', at: flag.raisedAt } },
        canTake: true,
      }),
    );
    expect(taken.textContent).toContain('Kofi is on it');
    const readOnly = render(createElement(UrgentFlagBanner, { ...base, flag, canTake: false }));
    expect(readOnly.querySelector('button')).toBeNull();
    expect(readOnly.textContent).toContain('Nobody has taken this patient yet.');
  });

  it('words a screening finding as its own, with what was found and no tier reasons', () => {
    const host = render(
      createElement(UrgentFlagBanner, {
        ...base,
        reasons: [],
        flag: { ...flag, kind: 'SCREENING_URGENT' as const, detail: 'Chest pain' },
        canTake: true,
      }),
    );
    expect(host.textContent).toContain('Urgent at screening: see today');
    expect(host.textContent).toContain('Chest pain');
    expect(host.textContent).not.toContain('Danger signs recorded');
  });
});
