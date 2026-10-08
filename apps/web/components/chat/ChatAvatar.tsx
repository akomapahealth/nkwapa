'use client';

import { Users } from 'lucide-react';
import { initialsOf } from '@/lib/chat-display';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-10 w-10 text-sm',
} as const;

/**
 * A person's initials in a circle, ringed green while they are online (#30).
 *
 * The ring is not the only signal: the dot beside it and the text label (screen readers get
 * "online" or "offline") say the same thing, so it never rests on colour alone.
 */
export function ChatAvatar({
  name,
  online,
  size = 'md',
}: {
  name: string;
  /** Leave undefined to show no presence at all (e.g. yourself). */
  online?: boolean;
  size?: keyof typeof SIZES;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary',
          SIZES[size],
          online !== undefined && 'ring-2 ring-offset-2 ring-offset-background',
          online ? 'ring-success' : 'ring-transparent',
        )}
        aria-hidden="true"
      >
        {initialsOf(name)}
      </span>
      {online !== undefined ? (
        <>
          <span
            data-testid="presence-dot"
            data-online={online ? 'true' : 'false'}
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
              online ? 'bg-success' : 'bg-muted-foreground/40',
            )}
            aria-hidden="true"
          />
          <span className="sr-only">{online ? 'online' : 'offline'}</span>
        </>
      ) : null}
    </span>
  );
}

/** A group: a people icon, with how many members are online. */
export function ChatGroupAvatar({
  onlineCount,
  size = 'md',
}: {
  onlineCount: number;
  size?: keyof typeof SIZES;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-secondary/20 text-foreground ring-2 ring-offset-2 ring-offset-background',
          SIZES[size],
          onlineCount > 0 ? 'ring-success' : 'ring-transparent',
        )}
        aria-hidden="true"
      >
        <Users className="h-4 w-4" />
      </span>
      <span className="sr-only">{onlineCount > 0 ? `${onlineCount} online` : 'nobody online'}</span>
    </span>
  );
}
