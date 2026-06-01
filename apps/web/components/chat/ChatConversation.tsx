'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  useChatContext,
  type ChatConversation as ChatConversationType,
  type ChatMessage,
} from '@/lib/chat-context';
import { apiFetch } from '@/lib/api';
import { getChatSocket } from '@/lib/chat-socket';
import { ChatMessageBubble } from './ChatMessageBubble';

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground" />
    </span>
  );
}

export function ChatConversation({
  conversation,
  onBack,
}: {
  conversation: ChatConversationType;
  onBack: () => void;
}) {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const activeClinicId = bootstrapCtx?.activeClinicId;
  const currentUserId = bootstrapCtx?.bootstrap?.userId;
  const chat = useChatContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get the other participant's name for display
  const otherParticipant = conversation.participants.find((p) => p.userId !== currentUserId);
  const displayName = otherParticipant?.user.displayName ?? conversation.title ?? 'Chat';

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

    return () => {
      chat?.leaveConversation(conversation.id);
    };
  }, [conversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for real-time messages via socket event
  useEffect(() => {
    const socket = getChatSocket();
    if (!socket) return;

    const handler = (message: ChatMessage) => {
      if (message.conversationId === conversation.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [message, ...prev];
        });
        chat?.markRead(conversation.id);
      }
    };

    socket.on('message:new', handler);
    return () => {
      socket.off('message:new', handler);
    };
  }, [conversation.id, chat]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !chat) return;
    chat.sendMessage(conversation.id, trimmed);
    setInput('');
    chat.sendTypingStop(conversation.id);
  }, [input, chat, conversation.id]);

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

      chat.sendTypingStart(conversation.id);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        chat.sendTypingStop(conversation.id);
      }, 2000);
    },
    [chat, conversation.id],
  );

  const typingList = chat?.typingUsers[conversation.id] ?? [];

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
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{displayName}</h3>
          {otherParticipant && chat?.onlineUserIds.has(otherParticipant.userId) && (
            <p className="text-[11px] text-emerald-600">Online</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-3 py-2">
        <div ref={messagesEndRef} />
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.senderUserId === currentUserId}
          />
        ))}
        {hasMore && (
          <button
            onClick={() => fetchMessages(cursor)}
            disabled={loading}
            className="cursor-pointer self-center py-2 text-xs text-muted-foreground hover:underline"
          >
            {loading ? 'Loading...' : 'Load older messages'}
          </button>
        )}
      </div>

      {/* Typing indicator */}
      {typingList.length > 0 && (
        <div
          className="flex items-center gap-1.5 px-3 pb-1 text-[11px] text-muted-foreground"
          aria-live="polite"
        >
          <span className="truncate">
            {typingList.map((t) => t.displayName).join(', ')}{' '}
            {typingList.length === 1 ? 'is' : 'are'} typing
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
