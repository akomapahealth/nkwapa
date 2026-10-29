'use client';

import { useEffect, useState } from 'react';
import { AppWindow, Download, MonitorDown, Share, SquarePlus } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { useInstallPrompt } from '@/lib/use-install-prompt';
import type { InstallPlatform } from '@/lib/pwa/install-prompt';

/** Opened from the menu item; the dialog lives outside the menu, which unmounts on close. */
const INSTALL_INSTRUCTIONS_OPEN_EVENT = 'nkwapa:install-instructions-open';

const STEPS: Record<'ios' | 'macos-safari', { title: string; steps: React.ReactNode[] }> = {
  ios: {
    title: 'Add Nkwapa to your Home Screen',
    steps: [
      <>
        Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> Share in
        Safari&apos;s toolbar.
      </>,
      <>
        Choose <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />{' '}
        <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
      </>,
      <>Open Nkwapa from its new icon. It runs in its own window, like any other app.</>,
    ],
  },
  'macos-safari': {
    title: 'Add Nkwapa to your Dock',
    steps: [
      <>
        In Safari&apos;s menu bar, choose <strong>File</strong>, then <strong>Add to Dock</strong>.
      </>,
      <>
        Click <strong>Add</strong>.
      </>,
      <>Open Nkwapa from the Dock. It runs in its own window, like any other app.</>,
    ],
  },
};

/**
 * The install state plus the one action both entry points share (#206): Chromium's held prompt, or
 * the manual steps where the browser has none. `enabled` folds in the feature flag.
 */
export function useInstallAction() {
  const prompt = useInstallPrompt();
  const install = () => {
    trackEvent('pwa.install.shown', { platform: prompt.platform });
    if (prompt.platform === 'chromium') void prompt.promptInstall();
    else window.dispatchEvent(new Event(INSTALL_INSTRUCTIONS_OPEN_EVENT));
  };
  return { ...prompt, enabled: isWebFeatureEnabled('pwaInstall'), install };
}

/** "Install app" in the account menu (#206). Hidden when installed or when the browser can't. */
export function InstallAppMenuItem() {
  const { enabled, canInstall, install } = useInstallAction();
  if (!enabled || !canInstall) return null;

  return (
    <DropdownMenuItem onSelect={install}>
      <Download className="mr-2 h-4 w-4" />
      Install app
    </DropdownMenuItem>
  );
}

/** The manual steps for browsers with no install prompt (iOS/iPadOS and macOS Safari). */
export function InstallInstructionsDialog() {
  const { platform } = useInstallPrompt();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(INSTALL_INSTRUCTIONS_OPEN_EVENT, show);
    return () => window.removeEventListener(INSTALL_INSTRUCTIONS_OPEN_EVENT, show);
  }, []);

  if (!isWebFeatureEnabled('pwaInstall') || !isManualPlatform(platform)) return null;
  const content = STEPS[platform];
  const Icon = platform === 'ios' ? AppWindow : MonitorDown;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md rounded-lg border-border/80">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="font-heading text-2xl">{content.title}</DialogTitle>
          <DialogDescription>
            Nkwapa opens straight into your workspace, and changes saved on this device are better
            protected from being cleared.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {content.steps.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm leading-6 text-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {platform === 'ios' ? (
          <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            The installed app keeps its own sign-in, separate from Safari, so you sign in once more
            the first time you open it.
          </p>
        ) : null}
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isManualPlatform(platform: InstallPlatform): platform is 'ios' | 'macos-safari' {
  return platform === 'ios' || platform === 'macos-safari';
}
