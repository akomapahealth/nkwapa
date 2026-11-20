'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Send, Settings2 } from 'lucide-react';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { NotificationFeed, useInboxFeed } from '@/components/notifications/NotificationFeed';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { useBootstrap } from '@/lib/bootstrap-context';
import { hasPermission } from '@/lib/ops';

type Filter = 'all' | 'unread';

/**
 * The bell's full page: what happened for this person, by day, newest first. Opening a row marks
 * it read and goes where it points; read runs of one kind fold into one row.
 */
export default function NotificationsPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const feed = useInboxFeed();
  const [filter, setFilter] = useState<Filter>('all');
  const canSeeDelivery = hasPermission(
    bootstrap?.effectivePermissionsForActiveClinic ?? [],
    'REMINDER.READ',
  );
  const { items, unread } = feed;
  const shown = (items ?? []).filter((item) => filter === 'all' || !item.readAt);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <AppPageHeader
        title="Notifications"
        description="Messages, urgent findings, requests and invitations for you."
        hideDescriptionOnPhone
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSeeDelivery ? (
              <Button asChild variant="ghost">
                <Link href="/notifications/delivery">
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                  Message delivery
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link href="/account#notifications">
                <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Alert settings
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <SegmentedControl
          label="Show"
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: unread > 0 ? `Unread (${unread})` : 'Unread' },
          ]}
          className="w-full min-w-0 max-w-[16rem]"
        />
        <Button
          variant="outline"
          onClick={() => feed.markRead()}
          disabled={unread === 0}
          className="shrink-0"
        >
          <CheckCheck className="h-4 w-4 compact:mr-2" aria-hidden="true" />
          {/* Phones keep the name for assistive tech; the row has no room for the words. */}
          <span className="sr-only compact:not-sr-only">Mark all read</span>
        </Button>
      </div>

      {feed.error && !items ? (
        <InlineErrorState
          title="Notifications could not be loaded"
          description={feed.error}
          onRetry={() => void feed.load()}
        />
      ) : !items ? (
        <SectionSkeleton lines={6} />
      ) : shown.length === 0 ? (
        <EmptyStateCard
          icon={<Bell className="h-5 w-5" aria-hidden="true" />}
          title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
          description={
            filter === 'unread'
              ? 'You have read everything. Switch to All to see earlier ones.'
              : 'Messages, urgent findings and requests for you show here.'
          }
        />
      ) : (
        <NotificationFeed feed={feed} items={shown} />
      )}

      {items && feed.nextBefore && filter === 'all' ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void feed.loadMore()}
            disabled={feed.loadingMore}
          >
            {feed.loadingMore ? 'Loading…' : 'Show earlier notifications'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
