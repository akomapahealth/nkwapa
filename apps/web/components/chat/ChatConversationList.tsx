'use client';

import { MessageSquarePlus, Users } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useChatContext, type ChatConversation } from '@/lib/chat-context';
import { conversationTitle, isGroup, otherMembers, typingSummary } from '@/lib/chat-display';
import { ChatAvatar, ChatGroupAvatar } from './ChatAvatar';
import { ChatUnreadBadge } from './ChatUnreadBadge';

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

  if (!chat) return null;

  const { conversations, onlineUserIds, typingUsers } = chat;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h3 className="text-sm font-semibold">Messages</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewGroup}
            className="cursor-pointer rounded-md p-1.5 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="New group"
            aria-label="New group"
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            onClick={onNewMessage}
            className="cursor-pointer rounded-md p-1.5 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="New message"
            aria-label="New message"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">No conversations yet.</p>
            <button
              onClick={onNewMessage}
              className="mt-2 cursor-pointer rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Start a new conversation
            </button>
          </div>
        ) : (
          conversations.map((conv) => {
            const name = conversationTitle(conv, currentUserId);
            const others = otherMembers(conv, currentUserId);
            const group = isGroup(conv);
            const onlineCount = others.filter((p) => onlineUserIds.has(p.userId)).length;
            const typing = typingSummary(
              (typingUsers[conv.id] ?? []).map((t) => t.displayName.split(' ')[0]),
            );

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                data-testid="chat-conversation-row"
                className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {group ? (
                  <ChatGroupAvatar onlineCount={onlineCount} />
                ) : (
                  <ChatAvatar
                    name={others[0]?.user.displayName ?? name}
                    online={others[0] ? onlineUserIds.has(others[0].userId) : false}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {conv.lastMessage && (
                      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                        {formatRelativeTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  {typing ? (
                    <p className="truncate text-xs italic text-primary" aria-live="polite">
                      {typing}…
                    </p>
                  ) : conv.lastMessage ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {conv.lastMessage.senderUserId === currentUserId
                        ? 'You: '
                        : group
                          ? `${
                              others.find((p) => p.userId === conv.lastMessage?.senderUserId)?.user
                                .firstName ?? 'Someone'
                            }: `
                          : ''}
                      {conv.lastMessage.content}
                    </p>
                  ) : group ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {others.length + 1} members{onlineCount ? ` · ${onlineCount} online` : ''}
                    </p>
                  ) : null}
                </div>
                {conv.unreadCount > 0 && (
                  <div className="relative shrink-0">
                    <ChatUnreadBadge count={conv.unreadCount} />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
