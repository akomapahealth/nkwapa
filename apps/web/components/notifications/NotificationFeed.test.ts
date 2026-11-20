import { groupFeed } from './NotificationFeed';
import type { InboxItem } from '@/lib/inbox';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const now = new Date('2026-11-20T15:00:00');
let n = 0;
function item(overrides: Partial<InboxItem>): InboxItem {
  n += 1;
  return {
    id: `n${n}`,
    kind: 'INVITE',
    title: `Person ${n} joined`,
    body: null,
    url: '/x',
    count: 1,
    clinicId: 'c1',
    updatedAt: '2026-11-20T14:00:00',
    readAt: '2026-11-20T14:30:00',
    ...overrides,
  };
}

it('folds three or more read items of one kind on one day into one group', () => {
  const items = [item({}), item({}), item({}), item({ kind: 'FOLLOW_UP_DUE' })];
  const [today] = groupFeed(items, now);
  expect(today.label).toBe('Today');
  expect(today.entries.map((e) => e.type)).toEqual(['group', 'item']);
  expect(today.entries[0].type === 'group' && today.entries[0].items).toHaveLength(3);
});

it('keeps unread items out of a fold, and does not fold two', () => {
  const unread = item({ readAt: null });
  const [today] = groupFeed([unread, item({}), item({})], now);
  expect(today.entries.map((e) => e.type)).toEqual(['item', 'item', 'item']);
});

it('puts an unread urgent finding first, then day sections', () => {
  const urgent = item({ kind: 'HEALTH_ALERT', readAt: null, updatedAt: '2026-11-18T09:00:00' });
  const sections = groupFeed([item({}), item({ updatedAt: '2026-11-19T10:00:00' }), urgent], now);
  expect(sections.map((s) => s.label)).toEqual(['Needs you now', 'Today', 'Yesterday']);
});
