import type { ChatConversation } from './chat-context';
import { conversationTitle, initialsOf, presenceLabel, typingSummary } from './chat-display';

const NOW = new Date('2026-10-08T12:00:00Z');
const member = (userId: string, displayName: string, isActive = true) => ({
  id: `p-${userId}`,
  conversationId: 'c1',
  userId,
  lastReadAt: null,
  isActive,
  user: { id: userId, displayName, firstName: displayName.split(' ')[0], lastName: null },
});
const conversation = (overrides: Partial<ChatConversation>): ChatConversation => ({
  id: 'c1',
  clinicId: 'clinic',
  type: 'DIRECT',
  title: null,
  createdAt: '',
  updatedAt: '',
  participants: [],
  lastMessage: null,
  unreadCount: 0,
  ...overrides,
});

describe('staff chat display (#30)', () => {
  it('says who is here and when the others were last seen', () => {
    expect(presenceLabel(true, null, NOW)).toBe('Active now');
    expect(presenceLabel(false, null, NOW)).toBe('Offline');
    expect(presenceLabel(false, '2026-10-08T11:59:40Z', NOW)).toBe('Last seen just now');
    expect(presenceLabel(false, '2026-10-08T11:55:00Z', NOW)).toBe('Last seen 5 min ago');
    expect(presenceLabel(false, '2026-10-08T09:00:00Z', NOW)).toBe('Last seen 3 h ago');
    expect(presenceLabel(false, '2026-10-07T09:00:00Z', NOW)).toBe('Last seen yesterday');
  });

  it('names a direct chat after the other person', () => {
    const direct = conversation({ participants: [member('me', 'Me'), member('u2', 'Ama Mensah')] });
    expect(conversationTitle(direct, 'me')).toBe('Ama Mensah');
  });

  it('names a group by its title, or by the people still in it', () => {
    const people = [
      member('me', 'Me'),
      member('u2', 'Ama Mensah'),
      member('u3', 'Kofi Boateng'),
      member('u4', 'Esi Owusu'),
      member('u5', 'Yaw Asante', false),
    ];
    expect(
      conversationTitle(
        conversation({ type: 'GROUP', title: 'Triage', participants: people }),
        'me',
      ),
    ).toBe('Triage');
    expect(conversationTitle(conversation({ type: 'GROUP', participants: people }), 'me')).toBe(
      'Ama, Kofi and 1 other',
    );
    expect(
      conversationTitle(conversation({ type: 'GROUP', participants: people.slice(0, 3) }), 'me'),
    ).toBe('Ama and Kofi');
  });

  it('summarizes who is typing without a wall of names', () => {
    expect(typingSummary([])).toBeNull();
    expect(typingSummary(['Ama'])).toBe('Ama is typing');
    expect(typingSummary(['Ama', 'Kofi'])).toBe('Ama and Kofi are typing');
    expect(typingSummary(['Ama', 'Kofi', 'Esi'])).toBe('3 people are typing');
  });

  it('makes initials from a display name', () => {
    expect(initialsOf('Ama Mensah')).toBe('AM');
    expect(initialsOf('kofi')).toBe('K');
    expect(initialsOf('  ')).toBe('?');
  });
});
