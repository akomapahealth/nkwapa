'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from './auth-context';
import { useBootstrap } from './bootstrap-context';
import { apiFetch } from './api';
import { connectChatSocket, disconnectChatSocket, getChatSocket } from './chat-socket';

// --- Types ---

export interface ChatUser {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  role?: string;
}

export interface ChatParticipant {
  id: string;
  conversationId: string;
  userId: string;
  lastReadAt: string | null;
  isActive: boolean;
  user: ChatUser;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  clinicId: string;
  content: string;
  encrypted: boolean;
  status: string;
  createdAt: string;
  sender: ChatUser;
}

export interface ChatConversation {
  id: string;
  clinicId: string;
  type: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ChatParticipant[];
  lastMessage: {
    id: string;
    content: string;
    senderUserId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

interface ChatContextValue {
  isConnected: boolean;
  conversations: ChatConversation[];
  onlineUserIds: Set<string>;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  sendMessage: (conversationId: string, content: string) => void;
  markRead: (conversationId: string) => void;
  startConversation: (participantUserId: string) => Promise<ChatConversation>;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  typingUsers: Record<string, { userId: string; displayName: string }[]>;
  sendTypingStart: (conversationId: string) => void;
  sendTypingStop: (conversationId: string) => void;
  totalUnread: number;
  refreshConversations: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext() {
  return useContext(ChatContext);
}

// --- Provider ---

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap;
  const activeClinicId = bootstrapCtx?.activeClinicId;

  const [isConnected, setIsConnected] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<
    Record<string, { userId: string; displayName: string }[]>
  >({});

  const socketRef = useRef<Socket | null>(null);

  const hasChatPermission =
    bootstrap?.effectivePermissionsForActiveClinic?.includes('CHAT.READ') ||
    bootstrap?.effectivePermissionsForActiveClinic?.includes('*');

  // Fetch conversations via REST
  const refreshConversations = useCallback(async () => {
    if (!activeClinicId || !getToken) return;
    try {
      const res = await apiFetch(`/clinics/${activeClinicId}/chat/conversations`, {
        getToken,
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // Silently fail - conversations will refresh on next message
    }
  }, [activeClinicId, getToken]);

  // Connect/disconnect WebSocket
  useEffect(() => {
    if (!getToken || !activeClinicId || !hasChatPermission) {
      disconnectChatSocket();
      setIsConnected(false);
      return;
    }

    let mounted = true;

    async function connect() {
      try {
        const sock = await connectChatSocket(getToken!);
        if (!mounted) return;

        socketRef.current = sock;

        sock.on('connect', () => {
          if (mounted) {
            setIsConnected(true);
            // Request online presence list
            sock.emit('presence:list');
          }
        });

        sock.on('disconnect', () => {
          if (mounted) setIsConnected(false);
        });

        // Presence events
        sock.on('presence:online', (data: { userId: string }) => {
          if (mounted) {
            setOnlineUserIds((prev) => new Set(prev).add(data.userId));
          }
        });

        sock.on('presence:offline', (data: { userId: string }) => {
          if (mounted) {
            setOnlineUserIds((prev) => {
              const next = new Set(prev);
              next.delete(data.userId);
              return next;
            });
          }
        });

        sock.on('presence:list', (data: { onlineUserIds: string[] }) => {
          if (mounted) {
            setOnlineUserIds(new Set(data.onlineUserIds));
          }
        });

        // Message events
        sock.on('message:new', (message: ChatMessage) => {
          if (!mounted) return;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== message.conversationId) return conv;
              return {
                ...conv,
                lastMessage: {
                  id: message.id,
                  content: message.content,
                  senderUserId: message.senderUserId,
                  createdAt: message.createdAt,
                },
                updatedAt: message.createdAt,
                unreadCount:
                  message.senderUserId !== bootstrap?.userId
                    ? conv.unreadCount + 1
                    : conv.unreadCount,
              };
            }),
          );
        });

        sock.on('unread:update', (data: { conversationId: string }) => {
          if (!mounted) return;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== data.conversationId) return conv;
              return { ...conv, unreadCount: conv.unreadCount + 1 };
            }),
          );
        });

        // Typing events
        sock.on(
          'typing:start',
          (data: { conversationId: string; userId: string; displayName: string }) => {
            if (!mounted) return;
            setTypingUsers((prev) => {
              const existing = prev[data.conversationId] ?? [];
              if (existing.some((t) => t.userId === data.userId)) return prev;
              return {
                ...prev,
                [data.conversationId]: [
                  ...existing,
                  { userId: data.userId, displayName: data.displayName },
                ],
              };
            });
          },
        );

        sock.on('typing:stop', (data: { conversationId: string; userId: string }) => {
          if (!mounted) return;
          setTypingUsers((prev) => ({
            ...prev,
            [data.conversationId]: (prev[data.conversationId] ?? []).filter(
              (t) => t.userId !== data.userId,
            ),
          }));
        });

        if (sock.connected) {
          setIsConnected(true);
          sock.emit('presence:list');
        }
      } catch {
        // Connection failed, will retry via socket.io reconnection
      }
    }

    void connect();
    void refreshConversations();

    return () => {
      mounted = false;
      disconnectChatSocket();
      setIsConnected(false);
    };
  }, [getToken, activeClinicId, hasChatPermission, bootstrap?.userId, refreshConversations]);

  // Actions
  const sendMessage = useCallback((conversationId: string, content: string) => {
    const sock = getChatSocket();
    if (sock?.connected) {
      sock.emit('message:send', { conversationId, content });
    }
  }, []);

  const markRead = useCallback((conversationId: string) => {
    const sock = getChatSocket();
    if (sock?.connected) {
      sock.emit('message:read', { conversationId });
    }
    // Optimistically reset unread count
    setConversations((prev) =>
      prev.map((conv) => (conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv)),
    );
  }, []);

  const startConversation = useCallback(
    async (participantUserId: string): Promise<ChatConversation> => {
      if (!activeClinicId || !getToken) {
        throw new Error('Not connected');
      }
      const res = await apiFetch(`/clinics/${activeClinicId}/chat/conversations`, {
        getToken,
        method: 'POST',
        body: JSON.stringify({ participantUserId }),
      });
      if (!res.ok) {
        throw new Error('Failed to create conversation');
      }
      const conv = await res.json();
      // Add to conversations list if not already there
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [{ ...conv, lastMessage: null, unreadCount: 0 }, ...prev];
      });
      return conv;
    },
    [activeClinicId, getToken],
  );

  const joinConversation = useCallback((conversationId: string) => {
    const sock = getChatSocket();
    if (sock?.connected) {
      sock.emit('conversation:join', { conversationId });
    }
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    const sock = getChatSocket();
    if (sock?.connected) {
      sock.emit('conversation:leave', { conversationId });
    }
  }, []);

  const sendTypingStart = useCallback((conversationId: string) => {
    const sock = getChatSocket();
    if (sock?.connected) {
      sock.emit('typing:start', { conversationId });
    }
  }, []);

  const sendTypingStop = useCallback((conversationId: string) => {
    const sock = getChatSocket();
    if (sock?.connected) {
      sock.emit('typing:stop', { conversationId });
    }
  }, []);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const value: ChatContextValue = {
    isConnected,
    conversations,
    onlineUserIds,
    activeConversationId,
    setActiveConversationId,
    sendMessage,
    markRead,
    startConversation,
    joinConversation,
    leaveConversation,
    typingUsers,
    sendTypingStart,
    sendTypingStop,
    totalUnread,
    refreshConversations,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
