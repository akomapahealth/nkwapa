/** @jest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import lottie from 'lottie-web';

jest.mock('./dashboard-illustration.module.css', () => ({}));
jest.mock('lottie-web', () => ({
  __esModule: true,
  default: {
    loadAnimation: jest.fn(() => {
      throw new Error('Synthetic player failure');
    }),
  },
}));
import { DashboardIllustration } from './DashboardIllustration';

const originalFetch = global.fetch;
const originalMatchMedia = window.matchMedia;
afterEach(() => {
  global.fetch = originalFetch;
  window.matchMedia = originalMatchMedia;
  jest.clearAllMocks();
});
function media(reduced: boolean) {
  window.matchMedia = jest.fn(() => ({
    matches: reduced,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

test('reduced motion renders a static rest frame without fetching an asset or mounting a player', async () => {
  media(true);
  global.fetch = jest.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(DashboardIllustration, { kind: 'hello' })));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lottie.loadAnimation).not.toHaveBeenCalled();
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector<HTMLElement>('[data-testid]')?.dataset.playing).toBe('false');
  } finally {
    act(() => root.unmount());
  }
});

test('a player that throws leaves the chosen SVG visible, with distinct fallback IDs per instance', async () => {
  media(false);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(DashboardIllustration, { kind: 'hello' }),
          createElement(DashboardIllustration, { kind: 'checklist' }),
        ),
      ),
    );
    expect(lottie.loadAnimation).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll('svg')).toHaveLength(2);
    for (const art of host.querySelectorAll('[data-testid]')) {
      expect((art.firstElementChild as HTMLElement).style.visibility).toBe('visible');
      expect(art.getAttribute('data-playing')).toBe('false');
    }
    const ids = Array.from(host.querySelectorAll('[id]')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  } finally {
    act(() => root.unmount());
  }
});
