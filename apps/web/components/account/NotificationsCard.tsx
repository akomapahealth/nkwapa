'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getNotificationState,
  setNotificationsEnabled,
  showAppNotification,
  type NotificationState,
} from '@/lib/browser-notifications';

/** The per-device opt-in for browser notifications, with what each state means. */
export function NotificationsCard() {
  // Read after mount: the server render has no browser to ask.
  const [state, setState] = useState<NotificationState | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => setState(getNotificationState()), []);

  const toggle = async (enabled: boolean) => {
    setWorking(true);
    try {
      setState(await setNotificationsEnabled(enabled));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
          Notifications
        </CardTitle>
        <CardDescription>
          A notification on this device when a colleague messages you while Nkwapa is open in
          another tab or in the background. It names who wrote, never what they wrote.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite">
        {state === null ? null : state === 'unsupported' ? (
          <p className="text-sm text-muted-foreground">
            This browser can&apos;t show notifications. On iPhone and iPad, add Nkwapa to your Home
            Screen first, then open it from there.
          </p>
        ) : state === 'denied' ? (
          <InlineNotice tone="warning">
            Notifications are blocked for Nkwapa in this browser. Allow them in the site settings
            (the icon beside the address), then come back here to turn them on.
          </InlineNotice>
        ) : state === 'on' ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              On for this device
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void showAppNotification({
                  title: 'Notifications are on',
                  body: 'This is how a new message will look.',
                  url: '/account',
                  tag: 'test',
                })
              }
            >
              Send a test
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={working}
              onClick={() => void toggle(false)}
            >
              <BellOff className="mr-2 h-4 w-4" aria-hidden="true" />
              Turn off
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-muted-foreground">Off for this device.</p>
            <Button size="sm" disabled={working} onClick={() => void toggle(true)}>
              <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
              Turn on notifications
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
