'use client';

import type { ChatMessage } from '@/lib/chat-context';

export type ChatMessageView = ChatMessage & {
  optimisticId?: string;
  deliveryState?: 'pending' | 'failed';
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessageBubble({
  message,
  isMine,
  onRetry,
}: {
  message: ChatMessageView;
  isMine: boolean;
  onRetry?: (message: ChatMessageView) => void;
}) {
  const isPending = isMine && message.deliveryState === 'pending';
  const isFailed = isMine && message.deliveryState === 'failed';
  const bubbleClassName = isFailed
    ? 'border border-destructive/40 bg-destructive/10 text-foreground rounded-br-md'
    : isMine
      ? 'bg-primary text-primary-foreground rounded-br-md'
      : 'bg-muted text-foreground rounded-bl-md';

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${bubbleClassName} ${isPending ? 'opacity-80' : ''}`}
      >
        {!isMine && (
          <p className="mb-0.5 text-[11px] font-medium opacity-70">{message.sender.displayName}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
        {isFailed ? (
          <button
            type="button"
            onClick={() => onRetry?.(message)}
            className="mt-1 block cursor-pointer text-left text-[10px] font-medium text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Could not send. Try again.
          </button>
        ) : (
          <p
            className={`mt-0.5 text-right text-[10px] ${
              isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'
            }`}
          >
            {isPending ? 'Sending...' : formatTime(message.createdAt)}
          </p>
        )}
      </div>
    </div>
  );
}
