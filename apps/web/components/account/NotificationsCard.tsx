'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { useAuth } from '@/lib/auth-context';
import {
  getNotificationState,
  setNotificationsEnabled,
  showAppNotification,
  webPushSupported,
  type NotificationState,
} from '@/lib/browser-notifications';

/** What reaches a device once notifications are on, per kind of account (#250). */
const WHAT_NOTIFIES = {
  staff:
    'A notification on this device when a colleague messages you, a patient is assigned to you or a note is waiting for your cosign.',
  patient: 'A notification on this device when the clinic answers your appointment request.',
};

/** The per-device opt-in for browser notifications, with what each state means. */
export function NotificationsCard({ audience }: { audience: 'staff' | 'patient' }) {
  const getToken = useAuth();
  // Read after mount: the server render has no browser to ask.
  const [state, setState] = useState<NotificationState | null>(null);
  const [working, setWorking] = useState(false);
  const [background, setBackground] = useState(false);

  useEffect(() => {
    setState(getNotificationState());
    setBackground(webPushSupported());
  }, []);

  const toggle = async (enabled: boolean) => {
    setWorking(true);
    try {
      setState(await setNotificationsEnabled(enabled, getToken));
    } finally {
      setWorking(false);
    }
  };

  return (
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Notifications
        </RecordSectionTitle>
        <RecordSectionDescription>
          {WHAT_NOTIFIES[audience]}{' '}
          {background
            ? 'It arrives even when Nkwapa is closed.'
            : 'It arrives while Nkwapa is open in another tab or in the background.'}{' '}
          It says who or what kind, never any patient details.
        </RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent className="space-y-3" aria-live="polite">
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
                  body: 'This is how a notification will look.',
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
      </RecordSectionContent>
    </RecordSection>
  );
}
