'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { accessPoints } from '@/lib/access-summary';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { OPEN_CHAT_EVENT } from '@/lib/browser-notifications';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { INBOX_UNREAD_EVENT, fetchInbox, markInboxRead, type InboxItem } from '@/lib/inbox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** The administrator a notice says made the change, carried in its link by the API. */
function changedBy(item: InboxItem): string | null {
  return new URL(item.url, 'http://local').searchParams.get('changedBy');
}

/*
  "Your access has changed" (#329).

  When an administrator grants or removes one of this person's roles, the API files an
  ACCESS_CHANGE notification. The bell alone is easy to miss for something that changes what the
  whole app lets you do, so the first time one is seen unread it is shown here, once, with what
  the person can do now and a way to question it.

  It listens to the bell's own count rather than polling, and reloads identity when a change
  arrives so the sidebar and permission checks follow without a manual refresh.
*/
export function AccessChangeNotice() {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const refetch = bootstrapCtx?.refetch;
  const [items, setItems] = useState<InboxItem[]>([]);
  const lastCount = useRef(0);

  useEffect(() => {
    const onUnread = (event: Event) => {
      const count = (event as CustomEvent<{ unreadCount: number }>).detail?.unreadCount ?? 0;
      const rose = count > lastCount.current;
      lastCount.current = count;
      if (!rose || !getToken) return;
      fetchInbox(getToken)
        .then((page) => {
          const found = page.items.filter((item) => item.kind === 'ACCESS_CHANGE' && !item.readAt);
          if (found.length === 0) return;
          setItems(found);
          void refetch?.();
        })
        // A courtesy on top of the bell, which still lists the notice.
        .catch(() => undefined);
    };
    window.addEventListener(INBOX_UNREAD_EVENT, onUnread);
    return () => window.removeEventListener(INBOX_UNREAD_EVENT, onUnread);
  }, [getToken, refetch]);

  const dismiss = useCallback(() => {
    const ids = items.map((item) => item.id);
    setItems([]);
    if (getToken && ids.length) void markInboxRead(getToken, ids).catch(() => undefined);
  }, [getToken, items]);

  if (items.length === 0) return null;

  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const points = accessPoints(permissions, {
    stationWorkflow: isWebFeatureEnabled('stationWorkflow'),
  });
  const clinicName =
    (bootstrap?.availableClinics ?? bootstrap?.memberships ?? []).find(
      (clinic) => clinic.clinicId === bootstrap?.activeClinicId,
    )?.clinicName ?? null;
  const canChat = permissions.includes('*') || permissions.includes('CHAT.SEND');
  const admin = items.map(changedBy).find(Boolean) ?? null;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : dismiss())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Your access has changed</DialogTitle>
          <DialogDescription>An administrator changed what you can do in Nkwapa.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-rule border-y border-rule">
          {items.map((item) => (
            <li key={item.id} className="py-2.5 text-sm">
              <p className="font-medium text-foreground">{item.title}</p>
              {item.body ? <p className="text-muted-foreground">{item.body}</p> : null}
            </li>
          ))}
        </ul>
        <section aria-labelledby="access-change-now" className="space-y-1.5">
          <h3 id="access-change-now" className="text-eyebrow text-muted-foreground">
            {clinicName ? `What you can do at ${clinicName}` : 'What you can do now'}
          </h3>
          {points.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {points.map((point) => (
                <li key={point.label}>
                  <span className="font-medium text-foreground">{point.label}.</span>{' '}
                  <span className="text-muted-foreground">{point.where}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {bootstrap?.memberships.length || bootstrap?.globalRoles.length
                ? 'Nothing at this clinic. Switch clinic from the header to see your other access.'
                : 'You no longer have access to any clinic. If this is a mistake, contact the administrator named above.'}
            </p>
          )}
        </section>
        <DialogFooter>
          {canChat && admin ? (
            <Button
              variant="outline"
              onClick={() => {
                dismiss();
                window.dispatchEvent(
                  new CustomEvent(OPEN_CHAT_EVENT, { detail: { participantUserId: admin } }),
                );
              }}
            >
              This is a mistake, message them
            </Button>
          ) : null}
          <Button onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
