/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Radix resolves the root-hoisted React, not this workspace's (as in toast.test.tsx). Plain
// stand-ins keep what the host decides under test: the role, the buttons, and what closing does.
jest.mock('./dialog', () => {
  const { createElement: h } = jest.requireActual('react');
  const pass = ({ children }: { children?: unknown }) => h('div', null, children);
  return {
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children?: unknown;
    }) =>
      open
        ? h(
            'div',
            { onKeyDown: (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false) },
            children,
          )
        : null,
    DialogContent: ({ role, children }: { role?: string; children?: unknown }) =>
      h('div', { role }, children),
    DialogHeader: pass,
    DialogFooter: pass,
    DialogTitle: pass,
    DialogDescription: pass,
  };
});

import { confirmAction, ConfirmHost } from './confirm-dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(createElement(ConfirmHost)));
  return () => act(() => root.unmount());
}

describe('acknowledge-only confirmation', () => {
  it('has one button, ignores Escape, and resolves true only from that button', async () => {
    const unmount = mount();
    let answer: boolean | undefined;
    act(() => {
      void confirmAction({
        acknowledgeOnly: true,
        title: 'This visit needs a clinician now',
        description: '182/96 mmHg is in the hypertensive crisis range.',
        confirmLabel: "I've told a clinician",
      }).then((value) => {
        answer = value;
      });
    });

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(Array.from(dialog!.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      "I've told a clinician",
    ]);

    act(() => {
      dialog!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await act(async () => undefined);
    expect(answer).toBeUndefined();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    await act(async () => {
      (dialog!.querySelector('button') as HTMLButtonElement).click();
    });
    expect(answer).toBe(true);
    unmount();
  });
});
