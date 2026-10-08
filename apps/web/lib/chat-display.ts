import type { ChatConversation } from './chat-context';

/**
 * How the staff chat names conversations and describes people (#30). Pure, so the wording is
 * tested once rather than in every component that shows it.
 */

/** "Active now", "Last seen 5 min ago", or just "Offline" when nobody has seen them here yet. */
export function presenceLabel(
  online: boolean,
  lastSeenAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (online) return 'Active now';
  if (!lastSeenAt) return 'Offline';
  const minutes = Math.floor((now.getTime() - new Date(lastSeenAt).getTime()) / 60_000);
  if (minutes < 1) return 'Last seen just now';
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Last seen yesterday' : `Last seen ${days} days ago`;
}

/** Everyone else still in the conversation. */
export function otherMembers(conversation: ChatConversation, currentUserId: string | undefined) {
  return conversation.participants.filter(
    (participant) => participant.isActive !== false && participant.userId !== currentUserId,
  );
}

export function isGroup(conversation: Pick<ChatConversation, 'type'>): boolean {
  return conversation.type === 'GROUP';
}

/** A group's name, or its members: "Ama, Kofi and 2 others". A direct chat is the other person. */
export function conversationTitle(
  conversation: ChatConversation,
  currentUserId: string | undefined,
): string {
  if (isGroup(conversation) && conversation.title) return conversation.title;
  const names = otherMembers(conversation, currentUserId).map(
    (participant) => participant.user.firstName || participant.user.displayName,
  );
  if (!isGroup(conversation)) {
    return otherMembers(conversation, currentUserId)[0]?.user.displayName ?? 'Conversation';
  }
  if (names.length === 0) return 'Just you';
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} other${names.length - 2 === 1 ? '' : 's'}`;
}

/** "Ama is typing", "Ama and Kofi are typing", "3 people are typing". */
export function typingSummary(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names.length} people are typing`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
