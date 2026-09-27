import { groupOutboxQueue, type OutboxQueueItem } from './use-outbox-queue';
import { queuedRow } from './testing/fake-sync-db';

function item(id: string, state: OutboxQueueItem['state']): OutboxQueueItem {
  return { row: queuedRow({ id }), state, label: 'Vital signs' };
}

describe('groupOutboxQueue', () => {
  it('splits the queue by what it needs from the clinician and keeps the order', () => {
    const queue = groupOutboxQueue([
      item('a', 'pending'),
      item('b', 'blocked'),
      item('c', 'retrying'),
      item('d', 'blocked'),
    ]);

    expect(queue.loaded).toBe(true);
    expect(queue.total).toBe(4);
    expect(queue.blocked.map((entry) => entry.row.id)).toEqual(['b', 'd']);
    expect(queue.retrying.map((entry) => entry.row.id)).toEqual(['c']);
    expect(queue.pending.map((entry) => entry.row.id)).toEqual(['a']);
  });
});
