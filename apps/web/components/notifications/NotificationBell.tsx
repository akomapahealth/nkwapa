'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import { Bell, CheckCheck } from 'lucide-react';
import { useWideSheet } from '@/components/app-shell/ListToolbar';
import { SectionSkeleton } from '@/components/feedback/AppState';
import {
  NotificationFeed,
  useInboxFeed,
  type InboxFeed,
} from '@/components/notifications/NotificationFeed';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUnreadNotificationCount } from '@/lib/inbox';
import { cn } from '@/lib/utils';

/** Tablets and computers open the list in place; phones go to the page. */
const PANEL_MIN_WIDTH = 600;
/** The panel shows the latest; the page has the rest. */
const PANEL_ITEMS = 12;

function UnreadBadge({ unread }: { unread: number }) {
  if (unread <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none tabular-nums text-destructive-foreground ring-2 ring-background"
    >
      {unread > 99 ? '99+' : unread}
    </span>
  );
}

/** The header bell: always on screen, phones included, with the unread count on it. */
export function NotificationBell({ active }: { active: boolean }) {
  const unread = useUnreadNotificationCount();
  const panel = useWideSheet(PANEL_MIN_WIDTH);
  const [open, setOpen] = useState(false);
  const feed = useInboxFeed(panel && open);
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  const icon = <Bell aria-hidden="true" className="h-[18px] w-[18px]" />;
  const buttonClass = cn('relative', (active || open) && 'bg-primary/10 text-primary');

  if (!panel) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className={buttonClass}
            data-tour="notifications"
          >
            <Link
              href="/notifications"
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              {icon}
              <UnreadBadge unread={unread} />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    );
  }

  // Opening a row closes the panel before it navigates.
  const panelFeed: InboxFeed = {
    ...feed,
    open: (item) => {
      setOpen(false);
      feed.open(item);
    },
  };
  const latest = (feed.items ?? []).slice(0, PANEL_ITEMS);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={buttonClass}
              data-tour="notifications"
              aria-label={label}
            >
              {icon}
              <UnreadBadge unread={unread} />
            </Button>
          </Popover.Trigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          aria-label="Notifications"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-50 flex max-h-[min(36rem,calc(100dvh-6rem))] w-[26rem] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none',
            'anchored-overlay origin-[--radix-popover-content-transform-origin]',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => feed.markRead()}
              disabled={feed.unread === 0}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Mark all read
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
            {feed.error && !feed.items ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{feed.error}</p>
            ) : !feed.items ? (
              <div className="px-3">
                <SectionSkeleton lines={4} />
              </div>
            ) : latest.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </p>
            ) : (
              <NotificationFeed feed={panelFeed} items={latest} dense />
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="border-t px-3 py-2.5 text-center text-sm font-semibold text-primary hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            See all notifications
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
