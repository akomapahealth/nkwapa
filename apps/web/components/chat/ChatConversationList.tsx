'use client';

import { MessageSquarePlus } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useChatContext, type ChatConversation } from '@/lib/chat-context';
import { ChatPresenceIndicator } from './ChatPresenceIndicator';
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
}: {
  onSelect: (conversation: ChatConversation) => void;
  onNewMessage: () => void;
}) {
  const bootstrapCtx = useBootstrap();
  const currentUserId = bootstrapCtx?.bootstrap?.userId;
  const chat = useChatContext();

  if (!chat) return null;

  const { conversations, onlineUserIds } = chat;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h3 className="text-sm font-semibold">Messages</h3>
        <button
          onClick={onNewMessage}
          className="cursor-pointer rounded-md p-1.5 transition-colors duration-150 hover:bg-muted"
          title="New message"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">No conversations yet.</p>
            <button
              onClick={onNewMessage}
              className="mt-2 cursor-pointer text-xs font-medium text-primary hover:underline"
            >
              Start a new conversation
            </button>
          </div>
        ) : (
          conversations.map((conv) => {
            const other = conv.participants.find((p) => p.userId !== currentUserId);
            const name = other?.user.displayName ?? conv.title ?? 'Unknown';
            const isOnline = other ? onlineUserIds.has(other.userId) : false;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted"
              >
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(other?.user.firstName?.[0] ?? name[0]).toUpperCase()}
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <ChatPresenceIndicator online={isOnline} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {conv.lastMessage && (
                      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                        {formatRelativeTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className="truncate text-xs text-muted-foreground">
                      {conv.lastMessage.senderUserId === currentUserId ? 'You: ' : ''}
                      {conv.lastMessage.content}
                    </p>
                  )}
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
