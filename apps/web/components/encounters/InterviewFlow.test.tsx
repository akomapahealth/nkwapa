/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { InterviewFlow, InterviewSection, useInterviewQuestion } from './InterviewFlow';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// React 18 only flushes effects inside act() when told it is running under a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Question({ id, label, value = '' }: { id: string; label: string; value?: string }) {
  useInterviewQuestion({ id, label, answered: value !== '', display: value, invalid: false });
  return <input id={id} aria-label={label} value={value} readOnly />;
}

const SECTIONS = [
  { id: 'a', title: 'First section' },
  { id: 'b', title: 'Second section' },
];

let root: Root;
let container: HTMLDivElement;
let onSave: jest.Mock;

async function renderFlow(secondAnswer = '') {
  await act(async () => {
    root.render(
      <InterviewFlow
        label="Test interview"
        sections={SECTIONS}
        canEdit
        onSave={onSave}
        saveLabel="Save test"
        save={{ saving: false, message: null, error: null }}
      >
        <InterviewSection id="a" title="First section">
          <Question id="q1" label="Asked one" value="Yes" />
          <Question id="q2" label="Unasked one" value={secondAnswer} />
        </InterviewSection>
        <InterviewSection id="b" title="Second section">
          <Question id="q3" label="Later one" />
        </InterviewSection>
      </InterviewFlow>,
    );
  });
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  window.requestAnimationFrame = (cb) => {
    cb(0);
    return 0;
  };
  Element.prototype.scrollIntoView = () => {};
  onSave = jest.fn().mockResolvedValue(undefined);
  root = createRoot(container);
  await renderFlow();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const section = (id: string) =>
  container.querySelector<HTMLElement>(`[data-interview-section="${id}"]`)!;
const button = (text: string | RegExp) =>
  [...container.querySelectorAll('button')].find((b) =>
    typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? ''),
  )!;

test('shows one section at a time and counts what was asked from the questions themselves', () => {
  expect(section('a').hidden).toBe(false);
  expect(section('b').hidden).toBe(true);
  const rail = container.querySelector('nav[aria-label="Test interview"]')!;
  expect(rail.textContent).toContain('1 of 2 asked');
  expect(rail.textContent).toContain('0 of 1 asked');
  expect(rail.querySelector('[aria-current="step"]')?.textContent).toContain('First section');
});

test('Next saves through the form, then moves on without unmounting the last section', async () => {
  await act(async () => button(/Next: Second section/).click());
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(section('a').hidden).toBe(true);
  expect(section('b').hidden).toBe(false);
  // Hidden, not removed: the answers in the first section are still in the form.
  expect(container.querySelector('#q1')).not.toBeNull();
});

test('a failed save stays on the section', async () => {
  onSave.mockRejectedValueOnce(new Error('needs a fix'));
  await act(async () => button(/Next: Second section/).click());
  expect(section('a').hidden).toBe(false);
});

test('the review screen lists every unasked question by its short label', async () => {
  await act(async () => button('Review and save').click());
  expect(section('a').hidden).toBe(true);
  const text = container.textContent ?? '';
  expect(text).toContain('Unasked one');
  expect(text).toContain('Later one');
  expect(button('Save test')).toBeDefined();
});

test('counts answers not saved from the first change, and asks before a link leaves the page', async () => {
  const status = () => container.querySelector('[role="status"]')!.textContent;
  expect(status()).toBe('');
  const flow = container.querySelector<HTMLElement>('[data-interview-flow]')!;
  await act(async () => {
    flow.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  await renderFlow('No');
  expect(status()).toBe('1 answer not saved');

  const link = document.createElement('a');
  link.href = '/patients/elsewhere';
  document.body.append(link);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  link.remove();

  await act(async () => button(/Next: Second section/).click());
  expect(status()).toBe('');
});
