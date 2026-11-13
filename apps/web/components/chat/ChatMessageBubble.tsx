'use client';

import type { ChatMessage } from '@/lib/chat-context';
import { formatOpsTime } from '@/lib/ops';

export type ChatMessageView = ChatMessage & {
  optimisticId?: string;
  deliveryState?: 'pending' | 'failed';
};

export function ChatMessageBubble({
  message,
  isMine,
  onRetry,
  showSender = !isMine,
  showTime = true,
}: {
  message: ChatMessageView;
  isMine: boolean;
  onRetry?: (message: ChatMessageView) => void;
  /** Group chats name the sender on the first message of each run; one-to-one chats never do. */
  showSender?: boolean;
  /** A run of quick messages shares one time, under its last bubble. */
  showTime?: boolean;
}) {
  const isPending = isMine && message.deliveryState === 'pending';
  const isFailed = isMine && message.deliveryState === 'failed';
  const bubbleClassName = isFailed
    ? 'border border-destructive/40 bg-destructive/10 text-foreground rounded-br-md'
    : isMine
      ? 'bg-primary text-primary-foreground rounded-br-md'
      : 'border border-border bg-card text-foreground rounded-bl-md';

  return (
    <div
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${showTime ? 'mb-2' : 'mb-0.5'}`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-3.5 py-2 ${bubbleClassName} ${isPending ? 'opacity-80' : ''}`}
      >
        {showSender && !isMine && (
          <p className="mb-0.5 text-[11px] font-medium opacity-70">{message.sender.displayName}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
        {isFailed ? (
          <button
            type="button"
            onClick={() => onRetry?.(message)}
            className="mt-1 block cursor-pointer text-left text-[10px] font-medium text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Could not send. Try again.
          </button>
        ) : isPending || showTime ? (
          <p
            className={`mt-0.5 text-right text-[10px] ${
              isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'
            }`}
          >
            {isPending ? 'Sending…' : formatOpsTime(message.createdAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
