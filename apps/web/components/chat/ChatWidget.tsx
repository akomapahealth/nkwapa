'use client';

import { useCallback, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  ChatProvider,
  useChatContext,
  type ChatConversation as ChatConversationType,
  type ChatUser,
} from '@/lib/chat-context';
import { ChatConversationList } from './ChatConversationList';
import { ChatConversation } from './ChatConversation';
import { ChatUserPicker } from './ChatUserPicker';
import { ChatUnreadBadge } from './ChatUnreadBadge';

type View = 'list' | 'conversation' | 'new-message';

function ChatPanel() {
  const chat = useChatContext();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [activeConversation, setActiveConversation] = useState<ChatConversationType | null>(null);

  const handleOpenConversation = useCallback((conv: ChatConversationType) => {
    setActiveConversation(conv);
    setView('conversation');
  }, []);

  const handleUserSelect = useCallback(
    async (user: ChatUser) => {
      if (!chat) return;
      try {
        const conv = await chat.startConversation(user.id);
        setActiveConversation(conv);
        setView('conversation');
      } catch {
        // ignore
      }
    },
    [chat],
  );

  const handleBack = useCallback(() => {
    setView('list');
    setActiveConversation(null);
  }, []);

  const totalUnread = chat?.totalUnread ?? 0;

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <>
            <MessageCircle className="h-5 w-5" />
            <ChatUnreadBadge count={totalUnread} />
          </>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 flex h-[500px] w-[350px] flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
          {/* Connection indicator */}
          {chat && !chat.isConnected && (
            <div className="bg-amber-50 px-3 py-1 text-center text-[11px] text-amber-700">
              Reconnecting...
            </div>
          )}

          {view === 'list' && (
            <ChatConversationList
              onSelect={handleOpenConversation}
              onNewMessage={() => setView('new-message')}
            />
          )}

          {view === 'conversation' && activeConversation && (
            <ChatConversation conversation={activeConversation} onBack={handleBack} />
          )}

          {view === 'new-message' && (
            <ChatUserPicker onSelect={handleUserSelect} onBack={handleBack} />
          )}
        </div>
      )}
    </>
  );
}

export function ChatWidget() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap;
  const activeClinicId = bootstrapCtx?.activeClinicId;

  // Only show chat for authenticated users with an active clinic and chat permission
  const hasChatPermission =
    bootstrap?.effectivePermissionsForActiveClinic?.includes('CHAT.READ') ||
    bootstrap?.effectivePermissionsForActiveClinic?.includes('*');

  if (!bootstrap || !activeClinicId || !hasChatPermission) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <ChatProvider>
        <ChatPanel />
      </ChatProvider>
    </div>
  );
}
