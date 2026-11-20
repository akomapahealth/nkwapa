/** @jest-environment jsdom */
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mockConfirm = jest.fn();
jest.mock('@/components/ui/confirm-dialog', () => ({
  confirmAction: (...args: unknown[]) => mockConfirm(...args),
}));

import { WorkspacePanel, confirmPanelLeave } from './WorkspacePanel';
import { DialogTitle } from '@/components/ui/dialog';

// Desktop: every width query matches, so the panel docks beside the page.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root;
let host: HTMLDivElement;
const closed: string[] = [];

function Harness() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return createElement(
    'div',
    null,
    createElement('button', { id: 'open-b', onClick: () => setB(true) }, 'Open B'),
    createElement(
      WorkspacePanel,
      {
        open: a,
        title: 'Panel A',
        onOpenChange: (next: boolean) => {
          if (!next) closed.push('A');
          setA(next);
        },
      },
      createElement(DialogTitle, null, 'Panel A'),
      createElement('input', { id: 'field-a', 'aria-label': 'Field' }),
    ),
    createElement(
      WorkspacePanel,
      {
        open: b,
        title: 'Panel B',
        onOpenChange: (next: boolean) => {
          if (!next) closed.push('B');
          setB(next);
        },
      },
      createElement(DialogTitle, null, 'Panel B'),
    ),
  );
}

const flush = () => act(async () => {});
const byLabel = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
function type(value: string) {
  const input = document.getElementById('field-a') as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  closed.length = 0;
  mockConfirm.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('docks beside the page and closes without asking when nothing was typed', async () => {
  expect(document.body.dataset.workspaceOpen).toBe('true');
  await act(async () => byLabel('Close Panel A').click());
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(closed).toEqual(['A']);
});

it('asks before closing a panel with typed entries, and keeps it on "Keep editing"', async () => {
  type('Penicillin');
  mockConfirm.mockResolvedValueOnce(false);
  await act(async () => byLabel('Close Panel A').click());
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Discard changes?', confirmLabel: 'Discard' }),
  );
  expect(closed).toEqual([]);
});

it('hides with the entry kept, then restores from the unsaved button', async () => {
  type('Penicillin');
  await act(async () => byLabel('Hide Panel A').click());
  expect(document.body.dataset.workspaceOpen).toBeUndefined();
  const restore = byLabel('Show Panel A, not saved');
  expect(document.activeElement).toBe(restore);
  await act(async () => restore.click());
  expect((document.getElementById('field-a') as HTMLInputElement).value).toBe('Penicillin');
});

it('opening a second panel asks to discard the first, and closes it on yes', async () => {
  type('Penicillin');
  mockConfirm.mockResolvedValueOnce(true);
  await act(async () => (document.getElementById('open-b') as HTMLButtonElement).click());
  await flush();
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(closed).toEqual(['A']);
});

it('asks before a chart tab change would drop typed entries', async () => {
  await expect(confirmPanelLeave()).resolves.toBe(true);
  type('Penicillin');
  mockConfirm.mockResolvedValueOnce(false);
  await expect(confirmPanelLeave()).resolves.toBe(false);
  expect(mockConfirm).toHaveBeenCalledTimes(1);
});
