'use client';

import { useState } from 'react';
import { MessageSquarePlus, Users } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useChatContext, type ChatConversation } from '@/lib/chat-context';
import { conversationTitle, isGroup, otherMembers, typingSummary } from '@/lib/chat-display';
import { ChatAvatar, ChatGroupAvatar } from './ChatAvatar';
import { ChatSearchField } from './ChatSearchField';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatRelativeTime(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ChatConversationList({
  onSelect,
  onNewMessage,
  onNewGroup,
}: {
  onSelect: (conversation: ChatConversation) => void;
  onNewMessage: () => void;
  onNewGroup: () => void;
}) {
  const bootstrapCtx = useBootstrap();
  const currentUserId = bootstrapCtx?.bootstrap?.userId;
  const chat = useChatContext();
  const [filter, setFilter] = useState('');

  if (!chat) return null;

  const { conversations, onlineUserIds, typingUsers } = chat;
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? conversations.filter((conv) =>
        conversationTitle(conv, currentUserId).toLowerCase().includes(needle),
      )
    : conversations;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-2">
        <h3 className="text-lg font-semibold tracking-tight">Messages</h3>
        <div className="-mr-2 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewGroup}
            className="rounded-full"
            title="New group"
            aria-label="New group"
          >
            <Users aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewMessage}
            className="rounded-full"
            title="New message"
            aria-label="New message"
          >
            <MessageSquarePlus aria-hidden="true" />
          </Button>
        </div>
      </div>
      {conversations.length > 0 ? (
        <div className="border-b px-4 pb-2.5">
          <ChatSearchField
            value={filter}
            onChange={setFilter}
            placeholder="Search messages"
            label="Search conversations"
          />
        </div>
      ) : (
        <div className="border-b" />
      )}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        data-testid="chat-conversation-list"
      >
        {!chat.isConnected || chat.conversationLoadError ? (
          <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
            {chat.conversationLoadError ??
              'Messages need a connection. Conversations already shown are the last version loaded.'}
          </p>
        ) : null}
        {conversations.length === 0 &&
        (!chat.isConnected || chat.conversationLoadError) ? null : !chat.conversationsLoaded &&
          conversations.length === 0 ? (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Loading conversations…
          </p>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">No conversations yet.</p>
            <button
              onClick={onNewMessage}
              className="mt-2 min-h-11 cursor-pointer rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Start a new conversation
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No conversations match \u201c{filter.trim()}\u201d
          </p>
        ) : (
          shown.map((conv) => {
            const name = conversationTitle(conv, currentUserId);
            const others = otherMembers(conv, currentUserId);
            const group = isGroup(conv);
            const onlineCount = others.filter((p) => onlineUserIds.has(p.userId)).length;
            const unread = conv.unreadCount > 0;
            const typing = typingSummary(
              (typingUsers[conv.id] ?? []).map((t) => t.displayName.split(' ')[0]),
            );

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                data-testid="chat-conversation-row"
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-fast ease-out-strong hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {group ? (
                  <ChatGroupAvatar onlineCount={onlineCount} size="lg" />
                ) : (
                  <ChatAvatar
                    name={others[0]?.user.displayName ?? name}
                    online={others[0] ? onlineUserIds.has(others[0].userId) : false}
                    size="lg"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={cn(
                        'truncate text-[0.9375rem]',
                        unread ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      {name}
                    </p>
                    {conv.lastMessage && (
                      <span
                        className={cn(
                          'shrink-0 text-xs tabular-nums',
                          unread ? 'font-medium text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {formatRelativeTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {typing ? (
                      <p
                        className="min-w-0 flex-1 truncate text-sm italic text-primary"
                        aria-live="polite"
                      >
                        {typing}…
                      </p>
                    ) : conv.lastMessage ? (
                      <p
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm',
                          unread ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {conv.lastMessage.senderUserId === currentUserId
                          ? 'You: '
                          : group
                            ? `${
                                others.find((p) => p.userId === conv.lastMessage?.senderUserId)
                                  ?.user.firstName ?? 'Someone'
                              }: `
                            : ''}
                        {conv.lastMessage.content}
                      </p>
                    ) : group ? (
                      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        No messages yet
                      </p>
                    ) : (
                      <span className="flex-1" />
                    )}
                    {unread ? (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                        <span className="sr-only"> unread</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
