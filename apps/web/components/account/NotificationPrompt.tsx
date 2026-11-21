'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { showToast } from '@/components/ui/toast';
import { WHAT_NOTIFIES } from '@/components/account/NotificationsCard';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  getNotificationState,
  markNotificationPromptShown,
  setNotificationsEnabled,
  shouldOfferNotificationPrompt,
  wasNotificationPromptShown,
} from '@/lib/browser-notifications';
import { useInstallPrompt } from '@/lib/use-install-prompt';
import { shouldOfferWelcomeTour, welcomeTourAudience } from '@/lib/welcome-tour';

/**
 * In the installed app, once per sign-in, offers to turn notifications on when they are off.
 *
 * Installed only: that is where people expect an app to notify them, and on iPhone it is the only
 * place notifications work at all. In a browser tab the choice stays in Account. It waits for
 * onboarding and the welcome tour, which own the first screen; a person who has just finished the
 * tour is asked the next time the app opens.
 */
export function NotificationPrompt() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const { isInstalled } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!bootstrap || bootstrap.onboarding || shouldOfferWelcomeTour(bootstrap)) return;
    if (
      !shouldOfferNotificationPrompt({
        installed: isInstalled,
        state: getNotificationState(),
        prompted: wasNotificationPromptShown(),
      })
    )
      return;
    markNotificationPromptShown();
    setOpen(true);
  }, [bootstrap, isInstalled]);

  if (!open || !bootstrap) return null;
  const audience = welcomeTourAudience(bootstrap);

  const turnOn = async () => {
    setWorking(true);
    try {
      const state = await setNotificationsEnabled(true, getToken);
      setOpen(false);
      if (state === 'on') {
        showToast({ title: 'Notifications are on', tone: 'success' });
      } else if (state === 'denied') {
        showToast({
          title: 'Notifications are blocked',
          description:
            "Allow them for Nkwapa in this device's settings, then turn them on in Account.",
        });
      }
    } catch {
      setOpen(false);
      showToast({
        title: 'Notifications could not be turned on',
        description: 'Try again from Account when you are online.',
        tone: 'error',
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => (next || working ? undefined : setOpen(false))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
          <DialogTitle>Turn on notifications?</DialogTitle>
          <DialogDescription>
            {WHAT_NOTIFIES[audience]} They say who or what kind, never any patient details.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">You can change this any time in Account.</p>
        <DialogFooter>
          <Button variant="outline" disabled={working} onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button disabled={working} onClick={() => void turnOn()}>
            {working ? 'Turning on…' : 'Turn on'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
