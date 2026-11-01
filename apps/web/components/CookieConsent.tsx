'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  OPEN_COOKIE_SETTINGS_EVENT,
  optionalCookiesInUse,
  readCookieConsent,
  saveCookieConsent,
} from '@/lib/cookie-consent';
import { withdrawPostHog } from '@/lib/posthog';
import { COOKIES_HREF } from '@/components/landing/links';

/**
 * The cookie banner and its settings, mounted once for the whole site.
 *
 * The banner asks only when the deployment has something optional to ask about, because asking
 * someone to accept cookies Nkwapa does not set would be noise, and asking again after a decline
 * would be pressure. Settings open from the footer or the cookie policy at any time.
 * "Essential only" sits beside "Accept", with equal weight, so declining is as easy as agreeing.
 */
export function CookieConsent() {
  const [bannerOpen, setBannerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const optional = optionalCookiesInUse();

  useEffect(() => {
    const saved = readCookieConsent();
    setAnalytics(saved?.analytics ?? false);
    if (optional && !saved) setBannerOpen(true);
    const openSettings = () => {
      setAnalytics(readCookieConsent()?.analytics ?? false);
      setSettingsOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
  }, [optional]);

  const decide = (accept: boolean) => {
    saveCookieConsent(accept);
    if (!accept) withdrawPostHog();
    setAnalytics(accept);
    setBannerOpen(false);
    setSettingsOpen(false);
  };

  return (
    <>
      {bannerOpen ? (
        <section
          aria-label="Cookie choices"
          className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 shadow-lg backdrop-blur"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:flex-row md:items-center md:gap-6">
            <p className="text-sm leading-6 text-muted-foreground md:flex-1">
              Nkwapa uses essential storage to sign you in and keep clinic work safe offline. With
              your permission, we also count page visits to improve the service. Never ads, never
              health details.{' '}
              <Link
                href={COOKIES_HREF}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Cookie policy
              </Link>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => decide(false)}>
                Essential only
              </Button>
              <Button variant="outline" onClick={() => decide(true)}>
                Accept analytics
              </Button>
              <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
                Settings
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cookie settings</DialogTitle>
            <DialogDescription>
              Your choice is saved in this browser. You can change it here at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <Checkbox id="cookie-essential" checked disabled />
              <div className="space-y-1">
                <Label htmlFor="cookie-essential">Essential</Label>
                <p className="leading-6 text-muted-foreground">
                  Sign-in, your selected clinic, offline records and changes waiting to send, and
                  settings such as dark mode. Nkwapa cannot work without them.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Checkbox
                id="cookie-analytics"
                checked={analytics}
                disabled={!optional}
                onCheckedChange={(value) => setAnalytics(value === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="cookie-analytics">Analytics</Label>
                <p className="leading-6 text-muted-foreground">
                  {optional
                    ? 'Counts page visits and clicks on this site, with no names, contact details or health information.'
                    : 'Not used by this site at the moment, so there is nothing to turn on.'}
                </p>
              </div>
            </div>
            <Link href={COOKIES_HREF} className="inline-block underline underline-offset-4">
              Read the cookie policy
            </Link>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => decide(false)}>
              Essential only
            </Button>
            <Button onClick={() => decide(analytics)} disabled={!optional}>
              Save choice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
