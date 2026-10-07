import { groupOutboxQueue, type OutboxQueueItem } from './use-outbox-queue';
import { OWNER, queuedRow } from './testing/fake-sync-db';

function item(
  id: string,
  state: OutboxQueueItem['state'],
  /** Null: queued before owners were recorded. */
  ownerUserId: string | null = OWNER,
): OutboxQueueItem {
  return {
    row: queuedRow({ id, ownerUserId: ownerUserId ?? undefined }),
    state,
    label: 'Vital signs',
  };
}

describe('groupOutboxQueue', () => {
  it('splits the queue by what it needs from the clinician and keeps the order', () => {
    const queue = groupOutboxQueue(
      [item('a', 'pending'), item('b', 'blocked'), item('c', 'retrying'), item('d', 'blocked')],
      OWNER,
    );

    expect(queue.loaded).toBe(true);
    expect(queue.total).toBe(4);
    expect(queue.blocked.map((entry) => entry.row.id)).toEqual(['b', 'd']);
    expect(queue.retrying.map((entry) => entry.row.id)).toEqual(['c']);
    expect(queue.pending.map((entry) => entry.row.id)).toEqual(['a']);
  });

  // #162: another account's changes, and ones with no recorded owner, are held, not counted.
  it('holds changes this account did not queue, outside its counts', () => {
    const queue = groupOutboxQueue(
      [item('mine', 'pending'), item('theirs', 'blocked', 'user-2'), item('old', 'pending', null)],
      OWNER,
    );

    expect(queue.total).toBe(1);
    expect(queue.blocked).toEqual([]);
    expect(queue.pending.map((entry) => entry.row.id)).toEqual(['mine']);
    expect(queue.held.map((entry) => entry.row.id)).toEqual(['theirs', 'old']);
  });

  it('holds everything while no account is known', () => {
    const queue = groupOutboxQueue([item('mine', 'pending')], null);
    expect(queue.total).toBe(0);
    expect(queue.held).toHaveLength(1);
  });
});
