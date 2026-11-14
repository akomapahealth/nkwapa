'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUnreadNotificationCount } from '@/lib/inbox';
import { cn } from '@/lib/utils';

/** The header bell: always on screen, phones included, with the unread count on it. */
export function NotificationBell({ active }: { active: boolean }) {
  const unread = useUnreadNotificationCount();
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn('relative', active && 'bg-primary/10 text-primary')}
        >
          <Link href="/notifications" aria-label={label} aria-current={active ? 'page' : undefined}>
            <Bell aria-hidden="true" className="h-[18px] w-[18px]" />
            {unread > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none tabular-nums text-destructive-foreground ring-2 ring-background"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
