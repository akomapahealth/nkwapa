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
