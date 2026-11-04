/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@/components/ui/confirm-dialog', () => ({ ConfirmHost: () => null }));
// The real Toaster resolves the root-hoisted React, not this workspace's; its UI is not under test.
let nextId = 0;
const show = (_title: unknown, options?: { id?: string | number }) => options?.id ?? `t${++nextId}`;
jest.mock('sonner', () => ({
  Toaster: () => null,
  toast: Object.assign(show, {
    info: show,
    success: show,
    warning: show,
    error: show,
    loading: show,
    dismiss: () => undefined,
  }),
}));
jest.mock('@/lib/theme-context', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { dismissToast, showToast, ToastProvider } from './toast';

// React 18 only runs act() without warnings when it is told it is in a test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(createElement(ToastProvider, null, null)));
  return { host, unmount: () => act(() => root.unmount()) };
}

const alerts = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[role="alert"]')).map((node) => node.textContent);

describe('toast announcements', () => {
  it('speaks an error once, assertively, and stops when it is dismissed', () => {
    const { host, unmount } = mount();
    let id = '';
    act(() => {
      id = showToast({ tone: 'error', title: 'Not saved', description: 'Try again' });
    });
    expect(alerts(host)).toEqual(['Not savedTry again']);

    act(() => dismissToast(id));
    expect(alerts(host)).toEqual([]);
    unmount();
  });

  it('keeps other tones out of the assertive region, and drops an error settled as success', () => {
    const { host, unmount } = mount();
    act(() => {
      showToast({ tone: 'success', title: 'Saved' });
    });
    expect(alerts(host)).toEqual([]);

    act(() => {
      const id = showToast({ tone: 'error', title: 'Not saved' });
      showToast({ id, tone: 'success', title: 'Saved' });
    });
    expect(alerts(host)).toEqual([]);
    unmount();
  });
});
