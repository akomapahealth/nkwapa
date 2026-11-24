'use client';

import type { ChatMessage } from '@/lib/chat-context';
import { formatOpsTime } from '@/lib/ops';
import { cn } from '@/lib/utils';

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
  startsRun = true,
}: {
  message: ChatMessageView;
  isMine: boolean;
  onRetry?: (message: ChatMessageView) => void;
  /** Group chats name the sender on the first message of each run; one-to-one chats never do. */
  showSender?: boolean;
  /** A run of quick messages shares one time, under its last bubble. */
  showTime?: boolean;
  /** First message of a run, so its top corner stays round. */
  startsRun?: boolean;
}) {
  const isPending = isMine && message.deliveryState === 'pending';
  const isFailed = isMine && message.deliveryState === 'failed';
  // Bubbles in one run sit close; the corner on the sender's side tightens where they join.
  const joined = isMine
    ? cn(!startsRun && 'rounded-tr-md', !showTime && 'rounded-br-md')
    : cn(!startsRun && 'rounded-tl-md', !showTime && 'rounded-bl-md');
  const bubbleClassName = isFailed
    ? 'border border-destructive/40 bg-destructive/10 text-foreground'
    : isMine
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-foreground';

  return (
    <div
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${showTime ? 'mb-2.5' : 'mb-0.5'}`}
    >
      <div
        className={cn(
          'max-w-[78%] rounded-[1.125rem] px-3.5 py-2',
          bubbleClassName,
          joined,
          isPending && 'opacity-80',
        )}
      >
        {showSender && !isMine && (
          <p className="mb-0.5 text-xs font-medium text-muted-foreground">
            {message.sender.displayName}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-snug">
          {message.content}
        </p>
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
            className={cn(
              'mt-0.5 text-right text-[11px] tabular-nums',
              isMine ? 'text-primary-foreground/70' : 'text-muted-foreground',
            )}
          >
            {isPending ? 'Sending…' : formatOpsTime(message.createdAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
