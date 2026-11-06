/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

// lucide-react, next/link and Radix's Slot resolve the root-hoisted React; see ReleaseBanner.test.tsx.
jest.mock('lucide-react', () => ({ FileEdit: () => null }));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children?: import('react').ReactNode }) => children,
}));
jest.mock('@/lib/auth-context', () => ({ useAuth: () => null }));
jest.mock('next/link', () => {
  const { createElement: h } = jest.requireActual<typeof import('react')>('react');
  return ({ href, children }: { href: string; children?: import('react').ReactNode }) =>
    h('a', { href }, children);
});

import { HapDraftRows } from './HapDraftsList';
import type { HapDraft } from '@/lib/hap-drafts';

const draft: HapDraft = {
  id: 'note-1',
  encounterId: 'enc-1',
  patientId: 'p-1',
  updatedAt: '2026-11-05T09:15:00.000Z',
  patient: { patientCode: 'NK-0001', firstName: 'Kofi', lastName: 'Asante' },
};

function render(props: Parameters<typeof HapDraftRows>[0]) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(createElement(HapDraftRows, props)));
  return { host, cleanup: () => act(() => root.unmount()) };
}

test('lists each HAP draft by patient with a link to its visit (#307)', () => {
  const { host, cleanup } = render({ drafts: [draft], timezone: 'Africa/Accra' });
  expect(host.textContent).toContain('Your HAP drafts');
  expect(host.textContent).toContain('Kofi Asante (NK-0001)');
  expect(host.textContent).toContain('Last saved Nov 5, 9:15 AM');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/encounters/enc-1');
  cleanup();
});

test('renders nothing without drafts and says so when they cannot load', () => {
  const empty = render({ drafts: [] });
  expect(empty.host.textContent).toBe('');
  empty.cleanup();
  const failed = render({ drafts: null, error: 'Offline.' });
  expect(failed.host.textContent).toContain('Your HAP drafts could not be loaded. Offline.');
  failed.cleanup();
});
