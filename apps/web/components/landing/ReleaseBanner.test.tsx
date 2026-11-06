/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Radix resolves the root-hoisted React, not this workspace's; the dialog's focus and Escape handling
// are covered by e2e/landing.spec.js. Here the content renders inline so the capping can be counted.
jest.mock('@/components/ui/dialog', () => {
  const { createElement: h, Fragment } = jest.requireActual<typeof import('react')>('react');
  const pass = (tag: string, extra = {}) =>
    function Mock({
      children,
      asChild,
      ...props
    }: {
      children?: import('react').ReactNode;
      asChild?: boolean;
      [key: string]: unknown;
    }) {
      return asChild ? children : h(tag, { ...props, ...extra }, children);
    };
  return {
    Dialog: ({ children }: { children?: import('react').ReactNode }) => h(Fragment, null, children),
    DialogTrigger: pass('button'),
    DialogContent: pass('div', { role: 'dialog' }),
    DialogTitle: pass('h2'),
    DialogDescription: pass('p'),
    DialogClose: pass('button'),
  };
});

// lucide-react is hoisted to the root too, with that React's element type.
jest.mock('lucide-react', () => ({
  ArrowRight: () => null,
  ArrowUpRight: () => null,
  X: () => null,
}));

import { ReleaseBanner } from './ReleaseBanner';
import type { Release } from '@/lib/release-notes';

const group = (heading: string, count: number) => ({
  heading,
  items: Array.from({ length: count }, (_, i) => ({ lead: `${heading} ${i + 1}`, text: '' })),
});

function open(release: Release) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(createElement(ReleaseBanner, { release })));
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  return { dialog, cleanup: () => act(() => root.unmount()) };
}

const release = (groups: Release['groups']): Release => ({
  version: '2.0.0',
  date: '2026-11-20',
  groups,
});

test('a long release opens with three items per group and expands one group at a time', () => {
  const { dialog, cleanup } = open(
    release([group('New', 16), group('Improved', 14), group('Fixed', 2)]),
  );
  expect(dialog.querySelectorAll('li')).toHaveLength(3 + 3 + 2);
  expect(dialog.textContent).toContain('32 changes: 16 new, 14 improved, 2 fixed');
  const toggles = [...dialog.querySelectorAll('button[aria-expanded]')] as HTMLButtonElement[];
  // Fixed has nothing hidden, so it gets no toggle.
  expect(toggles.map((b) => b.textContent)).toEqual(['Show all 16 new', 'Show all 14 improved']);

  act(() => toggles[0].click());
  expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
  expect(toggles[0].textContent).toBe('Show fewer');
  expect(dialog.querySelectorAll('li')).toHaveLength(16 + 3 + 2);

  act(() => toggles[0].click());
  expect(dialog.querySelectorAll('li')).toHaveLength(3 + 3 + 2);
  cleanup();
});

test('a short release shows every item with no toggle', () => {
  const { dialog, cleanup } = open(release([group('New', 4), group('Improved', 2)]));
  expect(dialog.querySelectorAll('li')).toHaveLength(6);
  expect(dialog.querySelectorAll('button[aria-expanded]')).toHaveLength(0);
  cleanup();
});

test('a group headed by kind and version keeps the colour of its kind', () => {
  const { dialog, cleanup } = open(release([group('Fixed in 2.0.1', 1), group('Fixed', 1)]));
  const dots = [...dialog.querySelectorAll('h3 span[aria-hidden]')].map((dot) => dot.className);
  expect(dots).toHaveLength(2);
  expect(dots[0]).toBe(dots[1]);
  expect(dots[0]).toContain('bg-foreground');
  cleanup();
});
