'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LogOut, Pencil, Send, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  useChatContext,
  type ChatConversation as ChatConversationType,
  type ChatMessage,
} from '@/lib/chat-context';
import { apiFetch } from '@/lib/api';
import { getChatSocket } from '@/lib/chat-socket';
import { ChatMessageBubble, type ChatMessageView } from './ChatMessageBubble';
import { ChatAvatar, ChatGroupAvatar } from './ChatAvatar';
import { ChatUserPicker } from './ChatUserPicker';
import {
  conversationTitle,
  isGroup,
  otherMembers,
  presenceLabel,
  typingSummary,
} from '@/lib/chat-display';

type MessageErrorPayload = {
  conversationId?: string;
  error?: string;
};

function createOptimisticId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `optimistic-${crypto.randomUUID()}`;
  }
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function findOptimisticMessageIndex(
  messages: ChatMessageView[],
  conversationId: string,
  senderUserId: string | undefined,
  content?: string,
  deliveryStates: Array<NonNullable<ChatMessageView['deliveryState']>> = ['pending', 'failed'],
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const isOptimistic = message.deliveryState
      ? deliveryStates.includes(message.deliveryState)
      : false;
    const sameConversation = message.conversationId === conversationId;
    const sameSender = !senderUserId || message.senderUserId === senderUserId;
    const sameContent = !content || message.content.trim() === content.trim();

    if (isOptimistic && sameConversation && sameSender && sameContent) {
      return index;
    }
  }

  return -1;
}

function reconcileIncomingMessage(messages: ChatMessageView[], incoming: ChatMessage) {
  if (messages.some((message) => message.id === incoming.id)) {
    return messages;
  }

  const optimisticIndex = findOptimisticMessageIndex(
    messages,
    incoming.conversationId,
    incoming.senderUserId,
    incoming.content,
  );

  if (optimisticIndex === -1) {
    return [incoming, ...messages];
  }

  return messages.map((message, index) => (index === optimisticIndex ? incoming : message));
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {/* Pulse, not bounce. Bounce easing reads as dated, and it is a translate, which means three
          dots were moving inside a message list someone is reading. Opacity says the same thing. */}
      <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground" />
    </span>
  );
}

export function ChatConversation({
  conversation: opened,
  onBack,
}: {
  conversation: ChatConversationType;
  onBack: () => void;
}) {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap;
  const activeClinicId = bootstrapCtx?.activeClinicId;
  const currentUserId = bootstrap?.userId;
  const chat = useChatContext();
  // The live copy: a rename or a new member arrives through the context, not through the prop.
  const conversation = chat?.conversations.find((conv) => conv.id === opened.id) ?? opened;
  const [panel, setPanel] = useState<'none' | 'members' | 'add'>('none');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const typingSentRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const group = isGroup(conversation);
  const others = otherMembers(conversation, currentUserId);
  const otherParticipant = group ? undefined : others[0];
  const displayName = conversationTitle(conversation, currentUserId);
  const onlineIds = chat?.onlineUserIds ?? new Set<string>();
  const onlineCount = others.filter((p) => onlineIds.has(p.userId)).length;

  // Fetch message history
  const fetchMessages = useCallback(
    async (cursorId?: string | null) => {
      if (!activeClinicId || !getToken) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (cursorId) params.set('cursor', cursorId);
        const res = await apiFetch(
          `/clinics/${activeClinicId}/chat/conversations/${conversation.id}/messages?${params}`,
          { getToken },
        );
        if (res.ok) {
          const data = await res.json();
          if (cursorId) {
            setMessages((prev) => [...prev, ...data.items]);
          } else {
            setMessages(data.items);
          }
          setHasMore(!!data.nextCursor);
          setCursor(data.nextCursor);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [activeClinicId, getToken, conversation.id],
  );

  // Initial load and join conversation room
  useEffect(() => {
    void fetchMessages();
    chat?.joinConversation(conversation.id);
    chat?.markRead(conversation.id);
    // Tells the unread count this conversation is on screen, so new messages arrive read.
    chat?.setActiveConversationId(conversation.id);

    return () => {
      chat?.setActiveConversationId(null);
      chat?.closeConversation(conversation.id);
    };
  }, [conversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for real-time messages via socket event
  useEffect(() => {
    const socket = getChatSocket();
    if (!socket) return;

    const handler = (message: ChatMessage) => {
      if (message.conversationId === conversation.id) {
        setMessages((prev) => {
          return reconcileIncomingMessage(prev, message);
        });
        chat?.markRead(conversation.id);
      }
    };

    const errorHandler = (payload?: MessageErrorPayload) => {
      if (payload?.conversationId && payload.conversationId !== conversation.id) return;

      setMessages((prev) => {
        const failedIndex = findOptimisticMessageIndex(
          prev,
          conversation.id,
          currentUserId,
          undefined,
          ['pending'],
        );
        if (failedIndex === -1) return prev;

        return prev.map((message, index) =>
          index === failedIndex
            ? { ...message, deliveryState: 'failed' as const, status: 'failed' }
            : message,
        );
      });
    };

    socket.on('message:new', handler);
    socket.on('message:error', errorHandler);
    return () => {
      socket.off('message:new', handler);
      socket.off('message:error', errorHandler);
    };
  }, [conversation.id, chat, currentUserId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const queueMessage = useCallback(
    (content: string) => {
      if (!chat || !currentUserId) return false;

      const optimisticId = createOptimisticId();
      const optimisticMessage: ChatMessageView = {
        id: optimisticId,
        optimisticId,
        conversationId: conversation.id,
        senderUserId: currentUserId,
        clinicId: activeClinicId ?? conversation.clinicId,
        content,
        encrypted: false,
        status: 'sending',
        createdAt: new Date().toISOString(),
        sender: {
          id: currentUserId,
          displayName: bootstrap?.displayName ?? 'You',
          firstName: null,
          lastName: null,
        },
        deliveryState: 'pending',
      };

      setMessages((prev) => [optimisticMessage, ...prev]);

      const queued = chat.sendMessage(conversation.id, content);
      if (!queued) {
        setMessages((prev) =>
          prev.map((message) =>
            message.optimisticId === optimisticId
              ? { ...message, deliveryState: 'failed' as const, status: 'failed' }
              : message,
          ),
        );
      }

      return true;
    },
    [
      activeClinicId,
      bootstrap?.displayName,
      chat,
      conversation.clinicId,
      conversation.id,
      currentUserId,
    ],
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (queueMessage(trimmed)) {
      setInput('');
      typingSentRef.current = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      chat?.sendTypingStop(conversation.id);
    }
  }, [input, queueMessage, chat, conversation.id]);

  const handleRetry = useCallback(
    (message: ChatMessageView) => {
      const trimmed = message.content.trim();
      if (!trimmed || !queueMessage(trimmed)) return;

      setMessages((prev) =>
        prev.filter((item) => item.optimisticId !== message.optimisticId && item.id !== message.id),
      );
    },
    [queueMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      if (!chat) return;

      // One start per burst of typing, not one per keystroke.
      if (!typingSentRef.current) {
        chat.sendTypingStart(conversation.id);
        typingSentRef.current = true;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        chat.sendTypingStop(conversation.id);
        typingSentRef.current = false;
      }, 2000);
    },
    [chat, conversation.id],
  );

  const typingList = chat?.typingUsers[conversation.id] ?? [];
  const typing = typingSummary(typingList.map((t) => t.displayName.split(' ')[0]));

  const runPanelAction = async (action: () => Promise<void>) => {
    setPanelError(null);
    try {
      await action();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'That did not work. Try again.');
    }
  };

  if (panel === 'add') {
    return (
      <ChatUserPicker
        mode="add"
        title={`Add to ${displayName}`}
        excludeUserIds={[...others.map((p) => p.userId), ...(currentUserId ? [currentUserId] : [])]}
        onSubmit={async (userIds) => {
          await chat?.addParticipants(conversation.id, userIds);
          setPanel('members');
        }}
        onBack={() => setPanel('members')}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <button
          onClick={onBack}
          className="cursor-pointer rounded-md p-1 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {group ? (
          <ChatGroupAvatar onlineCount={onlineCount} size="sm" />
        ) : (
          <ChatAvatar
            name={displayName}
            online={otherParticipant ? onlineIds.has(otherParticipant.userId) : false}
            size="sm"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{displayName}</h3>
          <p
            className="truncate text-[11px] text-muted-foreground"
            data-testid="chat-header-status"
          >
            {group
              ? `${others.length + 1} members${onlineCount ? ` · ${onlineCount} online` : ''}`
              : otherParticipant
                ? presenceLabel(
                    onlineIds.has(otherParticipant.userId),
                    chat?.lastSeen[otherParticipant.userId],
                  )
                : ''}
          </p>
        </div>
        {group ? (
          <button
            onClick={() => setPanel(panel === 'members' ? 'none' : 'members')}
            className="cursor-pointer rounded-md p-1.5 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Members"
            aria-expanded={panel === 'members'}
          >
            <Users className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {group && panel === 'members' ? (
        <div
          className="max-h-[45%] space-y-2 overflow-y-auto border-b bg-muted/30 px-3 py-2"
          data-testid="chat-members"
        >
          {renaming !== null ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void runPanelAction(async () => {
                  await chat?.renameConversation(conversation.id, renaming.trim() || null);
                  setRenaming(null);
                });
              }}
            >
              <input
                aria-label="Group name"
                value={renaming}
                maxLength={200}
                onChange={(event) => setRenaming(event.target.value)}
                className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                className="rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground"
              >
                Save
              </button>
            </form>
          ) : null}
          <ul className="space-y-1.5">
            {conversation.participants
              .filter((p) => p.isActive !== false)
              .map((p) => {
                const isMe = p.userId === currentUserId;
                const online = onlineIds.has(p.userId);
                return (
                  <li key={p.userId} className="flex items-center gap-2 text-sm">
                    <ChatAvatar
                      name={p.user.displayName}
                      online={isMe ? undefined : online}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {p.user.displayName}
                      {isMe ? ' (you)' : ''}
                    </span>
                    {!isMe ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {presenceLabel(online, chat?.lastSeen[p.userId])}
                      </span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
          {panelError ? (
            <p role="alert" className="text-xs text-destructive">
              {panelError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => setPanel('add')}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add people
            </button>
            <button
              onClick={() => setRenaming(conversation.title ?? '')}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Rename
            </button>
            <button
              onClick={() =>
                void runPanelAction(async () => {
                  if (!window.confirm(`Leave ${displayName}? You can be added back later.`)) return;
                  await chat?.leaveConversation(conversation.id);
                  onBack();
                })
              }
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Leave group
            </button>
          </div>
        </div>
      ) : null}

      {/* Messages */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-3 py-2">
        <div ref={messagesEndRef} />
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.senderUserId === currentUserId}
            onRetry={handleRetry}
          />
        ))}
        {hasMore && (
          <button
            onClick={() => fetchMessages(cursor)}
            disabled={loading}
            className="cursor-pointer self-center py-2 text-xs text-muted-foreground hover:underline"
          >
            Load older messages
            <span aria-live="polite" className="sr-only">
              {loading ? 'Loading older messages' : ''}
            </span>
          </button>
        )}
      </div>

      {/* Typing indicator */}
      {typingList.length > 0 && (
        <div
          className="flex items-center gap-1.5 px-3 pb-1 text-[11px] text-muted-foreground"
          aria-live="polite"
        >
          <span className="truncate" data-testid="chat-typing">
            {typing}
          </span>
          <TypingDots />
        </div>
      )}

      {/* Input */}
      <div className="border-t px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="touch-target cursor-pointer rounded-lg bg-primary p-2 text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
