const shown: Array<{ id: string; action?: { onClick: () => void } }> = [];
const dismissed: string[] = [];

jest.mock('@/components/ui/toast', () => ({
  showToast: (input: { action?: { onClick: () => void } }) => {
    const id = `t${shown.length}`;
    shown.push({ id, action: input.action });
    return id;
  },
  dismissToast: (id: string) => dismissed.push(id),
}));

import { flushPendingRemovals, removeWithUndo } from './undoable';

function setup(commit = jest.fn().mockResolvedValue(undefined)) {
  const hide = jest.fn();
  const restore = jest.fn();
  removeWithUndo({ message: 'Removed', hide, restore, commit, delayMs: 5000 });
  return { hide, restore, commit, toast: shown[shown.length - 1] };
}

beforeEach(() => {
  jest.useFakeTimers();
  shown.length = 0;
  dismissed.length = 0;
});
afterEach(() => jest.useRealTimers());

describe('removeWithUndo', () => {
  it('hides at once and commits only when the undo window has passed', () => {
    const { hide, commit } = setup();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(4999);
    expect(commit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('Undo puts it back and never commits', () => {
    const { restore, commit, toast } = setup();
    toast.action?.onClick();
    jest.advanceTimersByTime(10_000);

    expect(restore).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('an Undo that arrives after the commit changes nothing', () => {
    const { restore, commit, toast } = setup();
    jest.advanceTimersByTime(5000);
    toast.action?.onClick();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
    // The toast was taken down when the commit ran, so the Undo was not on offer anyway.
    expect(dismissed).toContain(toast.id);
  });

  it('leaving the page commits what is waiting instead of dropping it', () => {
    const { commit } = setup();
    flushPendingRemovals();
    expect(commit).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('a failed commit puts the item back and says so', async () => {
    const { restore } = setup(jest.fn().mockRejectedValue(new Error('offline')));
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    await Promise.resolve();

    expect(restore).toHaveBeenCalledTimes(1);
    expect(shown.length).toBe(2);
  });
});
