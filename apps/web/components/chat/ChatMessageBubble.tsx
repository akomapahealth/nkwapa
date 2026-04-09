'use client';

import type { ChatMessage } from '@/lib/chat-context';

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessageBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
          isMine
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
      >
        {!isMine && (
          <p className="mb-0.5 text-[11px] font-medium opacity-70">{message.sender.displayName}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
        <p
          className={`mt-0.5 text-[10px] ${
            isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'
          } text-right`}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
