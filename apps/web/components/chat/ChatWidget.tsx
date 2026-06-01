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
        data-testid="chat-toggle"
        className="relative flex h-[3.25rem] w-[3.25rem] cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform duration-200 hover:scale-105 active:scale-95 sm:h-14 sm:w-14"
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
        <div
          data-testid="chat-panel"
          className="absolute bottom-[calc(100%+0.75rem)] right-0 flex h-[min(620px,calc(100dvh-7.5rem))] max-h-[calc(100vh-7.5rem)] w-[min(420px,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[24px] border border-border/80 bg-background shadow-2xl shadow-black/20 sm:h-[min(660px,calc(100dvh-8rem))] sm:max-h-[calc(100vh-8rem)] sm:w-[min(460px,calc(100vw-2.5rem))]"
        >
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
    <div className="fixed bottom-4 right-3 z-50 sm:bottom-5 sm:right-5">
      <ChatProvider>
        <ChatPanel />
      </ChatProvider>
    </div>
  );
}
