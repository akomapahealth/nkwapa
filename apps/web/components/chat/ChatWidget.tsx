'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ChatUnreadBadge } from './ChatUnreadBadge';
import {
  CHAT_QUERY_PARAM,
  NOTIFICATION_CLICK_MESSAGE,
  OPEN_CHAT_EVENT,
  openNotificationUrl,
} from '@/lib/browser-notifications';

type View = 'list' | 'conversation' | 'new-message' | 'new-group';

function ChatPanel() {
  const chat = useChatContext();
  const [isOpen, setIsOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 599px)');
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [view, setView] = useState<View>('list');
  const [activeConversation, setActiveConversation] = useState<ChatConversationType | null>(null);

  const router = useRouter();
  // A conversation a notification asked for, opened once the list has it.
  const [requestedId, setRequestedId] = useState<string | null>(null);

  const handleOpenConversation = useCallback((conv: ChatConversationType) => {
    setActiveConversation(conv);
    setView('conversation');
  }, []);

  useEffect(() => {
    // A window the service worker opened arrives with ?chat=<id>; take it, then tidy the URL.
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(CHAT_QUERY_PARAM);
    if (fromUrl) {
      setRequestedId(fromUrl);
      url.searchParams.delete(CHAT_QUERY_PARAM);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    }
    const onOpenChat = (event: Event) => {
      const id = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (id) setRequestedId(id);
    };
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === NOTIFICATION_CLICK_MESSAGE && typeof event.data.url === 'string') {
        openNotificationUrl(event.data.url, (next) => router.push(next));
      }
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat);
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => {
      window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat);
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
    };
  }, [router]);

  useEffect(() => {
    if (!requestedId) return;
    const conv = chat?.conversations.find((entry) => entry.id === requestedId);
    if (!conv) return;
    setIsOpen(true);
    handleOpenConversation(conv);
    setRequestedId(null);
  }, [requestedId, chat?.conversations, handleOpenConversation]);

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

  const handleCreateGroup = useCallback(
    async (userIds: string[], groupName: string | null) => {
      if (!chat) return;
      const conv = await chat.startGroupConversation(groupName, userIds);
      setActiveConversation(conv);
      setView('conversation');
    },
    [chat],
  );

  const handleBack = useCallback(() => {
    setView('list');
    setActiveConversation(null);
  }, []);

  const totalUnread = chat?.totalUnread ?? 0;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
    A non-modal dialog: focus moves into the panel when it opens, Escape closes it from anywhere
    inside, and focus goes back to the button that opened it.
  */
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!panel?.contains(document.activeElement)) return;
      setIsOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const content = (
    <>
      {/* Connection indicator */}
      {chat && !chat.isConnected && (
        <div className="bg-warning/12 px-3 py-1 text-center text-[11px] text-warning-ink">
          Reconnecting…
        </div>
      )}

      {view === 'list' && (
        <ChatConversationList
          onSelect={handleOpenConversation}
          onNewMessage={() => setView('new-message')}
          onNewGroup={() => setView('new-group')}
        />
      )}

      {view === 'conversation' && activeConversation && (
        <ChatConversation conversation={activeConversation} onBack={handleBack} />
      )}

      {view === 'new-message' && <ChatUserPicker onSelect={handleUserSelect} onBack={handleBack} />}

      {view === 'new-group' && (
        <ChatUserPicker mode="group" onSubmit={handleCreateGroup} onBack={handleBack} />
      )}
    </>
  );

  return (
    <>
      {/* Floating chat button */}
      <button
        ref={toggleRef}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="chat-panel"
        data-testid="chat-toggle"
        className="relative flex h-[3.25rem] w-[3.25rem] cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-14 sm:w-14"
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
      {phone ? (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent
            ref={panelRef}
            id="chat-panel"
            data-testid="chat-panel"
            side="bottom"
            className="inset-x-0 top-0 flex h-[calc(100dvh-var(--keyboard-inset,0px))] max-h-none flex-col gap-0 rounded-none p-0 pb-safe"
          >
            <div className="h-5 shrink-0">
              <SheetTitle className="sr-only">Chat</SheetTitle>
              <SheetDescription className="sr-only">
                Messages with your clinic team.
              </SheetDescription>
            </div>
            {content}
          </SheetContent>
        </Sheet>
      ) : (
        isOpen && (
          <div
            ref={panelRef}
            id="chat-panel"
            role="dialog"
            aria-label="Chat"
            data-testid="chat-panel"
            className="absolute bottom-[calc(100%+0.75rem)] right-0 flex h-[min(620px,calc(100dvh-7.5rem-var(--workspace-bottom-nav-height,0px)))] max-h-[calc(100vh-7.5rem-var(--workspace-bottom-nav-height,0px))] w-[min(420px,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg sm:h-[min(660px,calc(100dvh-8rem))] sm:max-h-[calc(100vh-8rem)] sm:w-[min(460px,calc(100vw-2.5rem))]"
          >
            {content}
          </div>
        )
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
    <div
      data-chat-widget=""
      className="fixed bottom-[calc(1rem+var(--workspace-bottom-nav-height,0px)+env(safe-area-inset-bottom))] right-[calc(0.75rem+env(safe-area-inset-right))] z-50 sm:bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:right-[calc(1.25rem+env(safe-area-inset-right))]"
    >
      <ChatProvider>
        <ChatPanel />
      </ChatProvider>
    </div>
  );
}
