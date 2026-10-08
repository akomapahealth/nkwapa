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

/** How often a tab tells the server it is still here, and refreshes who else is (#30). */
const PRESENCE_HEARTBEAT_MS = 25_000;
const PRESENCE_REFRESH_MS = 60_000;
/** A typing indicator nobody stopped (a tab closed mid-sentence) clears itself after this. */
const TYPING_EXPIRY_MS = 6_000;

interface ChatContextValue {
  isConnected: boolean;
  conversations: ChatConversation[];
  onlineUserIds: Set<string>;
  /** When each person was last seen, for the ones not online now. */
  lastSeen: Record<string, string>;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  sendMessage: (conversationId: string, content: string) => boolean;
  markRead: (conversationId: string) => void;
  startConversation: (participantUserId: string) => Promise<ChatConversation>;
  startGroupConversation: (title: string | null, userIds: string[]) => Promise<ChatConversation>;
  addParticipants: (conversationId: string, userIds: string[]) => Promise<void>;
  renameConversation: (conversationId: string, title: string | null) => Promise<void>;
  leaveConversation: (conversationId: string) => Promise<void>;
  joinConversation: (conversationId: string) => void;
  /** Stop listening to a conversation's room (closing it), not leaving the group. */
  closeConversation: (conversationId: string) => void;
  typingUsers: Record<string, { userId: string; displayName: string }[]>;
  sendTypingStart: (conversationId: string) => void;
  sendTypingStop: (conversationId: string) => void;
  totalUnread: number;
  refreshConversations: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/** Most recent activity first, as the server lists them. */
function sortByActivity(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

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
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  // Read inside socket handlers, which outlive any one render.
  const activeConversationRef = useRef<string | null>(null);
  const knownConversationsRef = useRef<Set<string>>(new Set());
  const typingExpiryRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
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
        const data = (await res.json()) as ChatConversation[];
        knownConversationsRef.current = new Set(data.map((conv) => conv.id));
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

        sock.on('presence:offline', (data: { userId: string; lastSeenAt?: string }) => {
          if (mounted) {
            setOnlineUserIds((prev) => {
              const next = new Set(prev);
              next.delete(data.userId);
              return next;
            });
            if (data.lastSeenAt) {
              setLastSeen((prev) => ({ ...prev, [data.userId]: data.lastSeenAt! }));
            }
          }
        });

        sock.on(
          'presence:list',
          (data: { onlineUserIds: string[]; lastSeen?: Record<string, string> }) => {
            if (mounted) {
              setOnlineUserIds(new Set(data.onlineUserIds));
              if (data.lastSeen) setLastSeen(data.lastSeen);
            }
          },
        );

        // Someone started a conversation with this account, added it to a group, or changed one.
        const refreshOnChange = () => {
          if (mounted) void refreshConversations();
        };
        sock.on('conversation:new', refreshOnChange);
        sock.on('conversation:updated', refreshOnChange);
        sock.on('conversation:removed', (data: { conversationId: string }) => {
          if (!mounted) return;
          knownConversationsRef.current.delete(data.conversationId);
          setConversations((prev) => prev.filter((conv) => conv.id !== data.conversationId));
        });

        // Message events
        /*
          Unread is counted from `unread:update` alone, which the server sends once per message to
          each other member. `message:new` also reaches anyone with the conversation open, so
          counting both made an open conversation read 1 unread after every message (#30).
        */
        sock.on('message:new', (message: ChatMessage) => {
          if (!mounted) return;
          if (!knownConversationsRef.current.has(message.conversationId)) {
            void refreshConversations();
            return;
          }
          setConversations((prev) =>
            sortByActivity(
              prev.map((conv) =>
                conv.id !== message.conversationId
                  ? conv
                  : {
                      ...conv,
                      lastMessage: {
                        id: message.id,
                        content: message.content,
                        senderUserId: message.senderUserId,
                        createdAt: message.createdAt,
                      },
                      updatedAt: message.createdAt,
                    },
              ),
            ),
          );
        });

        sock.on(
          'unread:update',
          (data: {
            conversationId: string;
            lastMessage?: { content: string; senderUserId: string; createdAt: string };
          }) => {
            if (!mounted) return;
            // A conversation this device has not seen yet: someone else just started it.
            if (!knownConversationsRef.current.has(data.conversationId)) {
              void refreshConversations();
              return;
            }
            const isOpen = activeConversationRef.current === data.conversationId;
            setConversations((prev) =>
              sortByActivity(
                prev.map((conv) =>
                  conv.id !== data.conversationId
                    ? conv
                    : {
                        ...conv,
                        ...(data.lastMessage
                          ? {
                              lastMessage: {
                                id: `${data.lastMessage.createdAt}`,
                                ...data.lastMessage,
                              },
                              updatedAt: data.lastMessage.createdAt,
                            }
                          : {}),
                        unreadCount: isOpen ? 0 : conv.unreadCount + 1,
                      },
                ),
              ),
            );
          },
        );

        // Typing events
        sock.on(
          'typing:start',
          (data: { conversationId: string; userId: string; displayName: string }) => {
            if (!mounted) return;
            // Clears itself if no stop ever comes (the other tab closed mid-sentence).
            const key = `${data.conversationId}:${data.userId}`;
            clearTimeout(typingExpiryRef.current.get(key));
            typingExpiryRef.current.set(
              key,
              setTimeout(() => {
                setTypingUsers((prev) => ({
                  ...prev,
                  [data.conversationId]: (prev[data.conversationId] ?? []).filter(
                    (t) => t.userId !== data.userId,
                  ),
                }));
              }, TYPING_EXPIRY_MS),
            );
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
          clearTimeout(typingExpiryRef.current.get(`${data.conversationId}:${data.userId}`));
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

    // Stay online while this tab is open, and drop anyone whose tab stopped checking in.
    const heartbeat = setInterval(() => {
      const sock = getChatSocket();
      if (sock?.connected) sock.emit('presence:heartbeat');
    }, PRESENCE_HEARTBEAT_MS);
    const presenceRefresh = setInterval(() => {
      const sock = getChatSocket();
      if (sock?.connected) sock.emit('presence:list');
    }, PRESENCE_REFRESH_MS);
    const typingExpiry = typingExpiryRef.current;

    return () => {
      mounted = false;
      clearInterval(heartbeat);
      clearInterval(presenceRefresh);
      typingExpiry.forEach((timer) => clearTimeout(timer));
      typingExpiry.clear();
      disconnectChatSocket();
      setIsConnected(false);
    };
  }, [getToken, activeClinicId, hasChatPermission, bootstrap?.userId, refreshConversations]);

  // Actions
  const sendMessage = useCallback((conversationId: string, content: string) => {
    const sock = getChatSocket();
    if (sock?.connected) {
      sock.emit('message:send', { conversationId, content });
      return true;
    }
    return false;
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
      knownConversationsRef.current.add(conv.id);
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [{ ...conv, lastMessage: null, unreadCount: 0 }, ...prev];
      });
      return conv;
    },
    [activeClinicId, getToken],
  );

  /** A REST call on a conversation, with the API's own message on failure. */
  const conversationRequest = useCallback(
    async (path: string, init: { method: string; body?: unknown }) => {
      if (!activeClinicId || !getToken) throw new Error('Not connected');
      const res = await apiFetch(`/clinics/${activeClinicId}/chat/conversations${path}`, {
        getToken,
        method: init.method,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      if (!res.ok) {
        let message = 'That did not work. Try again.';
        try {
          const body = (await res.json()) as { message?: string };
          if (typeof body.message === 'string') message = body.message;
        } catch {
          // keep the default
        }
        throw new Error(message);
      }
      return res.json();
    },
    [activeClinicId, getToken],
  );

  const startGroupConversation = useCallback(
    async (title: string | null, userIds: string[]): Promise<ChatConversation> => {
      const conv = (await conversationRequest('/group', {
        method: 'POST',
        body: { title, participantUserIds: userIds },
      })) as ChatConversation;
      knownConversationsRef.current.add(conv.id);
      setConversations((prev) => [{ ...conv, lastMessage: null, unreadCount: 0 }, ...prev]);
      return { ...conv, lastMessage: null, unreadCount: 0 };
    },
    [conversationRequest],
  );

  const addParticipants = useCallback(
    async (conversationId: string, userIds: string[]) => {
      await conversationRequest(`/${conversationId}/participants`, {
        method: 'POST',
        body: { userIds },
      });
      await refreshConversations();
    },
    [conversationRequest, refreshConversations],
  );

  const renameConversation = useCallback(
    async (conversationId: string, title: string | null) => {
      await conversationRequest(`/${conversationId}`, { method: 'PATCH', body: { title } });
      await refreshConversations();
    },
    [conversationRequest, refreshConversations],
  );

  const leaveConversation = useCallback(
    async (conversationId: string) => {
      await conversationRequest(`/${conversationId}/leave`, { method: 'POST' });
      knownConversationsRef.current.delete(conversationId);
      setConversations((prev) => prev.filter((conv) => conv.id !== conversationId));
    },
    [conversationRequest],
  );

  const joinConversation = useCallback((conversationId: string) => {
    const sock = getChatSocket();
    if (sock?.connected) {
      sock.emit('conversation:join', { conversationId });
    }
  }, []);

  const closeConversation = useCallback((conversationId: string) => {
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

  const setActiveConversation = useCallback((id: string | null) => {
    activeConversationRef.current = id;
    setActiveConversationId(id);
  }, []);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const value: ChatContextValue = {
    isConnected,
    conversations,
    onlineUserIds,
    lastSeen,
    activeConversationId,
    setActiveConversationId: setActiveConversation,
    sendMessage,
    markRead,
    startConversation,
    startGroupConversation,
    addParticipants,
    renameConversation,
    leaveConversation,
    joinConversation,
    closeConversation,
    typingUsers,
    sendTypingStart,
    sendTypingStop,
    totalUnread,
    refreshConversations,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
