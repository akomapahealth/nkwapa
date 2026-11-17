/** @jest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useIdleLock } from './use-idle-lock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ active, lock }: { active: boolean; lock: () => void }) {
  useIdleLock(active, lock, 1000);
  return null;
}

describe('idle lock (#207, R2)', () => {
  let root: Root;
  beforeEach(() => {
    jest.useFakeTimers();
    root = createRoot(document.createElement('div'));
  });
  afterEach(() => {
    act(() => root.unmount());
    jest.useRealTimers();
  });

  it('locks after the idle time, and input restarts the count', () => {
    const lock = jest.fn();
    act(() => root.render(createElement(Probe, { active: true, lock })));
    jest.advanceTimersByTime(900);
    window.dispatchEvent(new Event('keydown'));
    jest.advanceTimersByTime(900);
    expect(lock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(200);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('does nothing outside an offline session', () => {
    const lock = jest.fn();
    act(() => root.render(createElement(Probe, { active: false, lock })));
    jest.advanceTimersByTime(5000);
    expect(lock).not.toHaveBeenCalled();
  });
});
