'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CheckCircle2,
  Compass,
  Download,
  LogOut,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  UserPen,
} from 'lucide-react';
import { useKeycloak } from '@/app/KeycloakProvider';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { useInstallAction } from '@/components/pwa/InstallApp';
import { DeviceStorageDetails } from '@/components/sync/DeviceStorageDetails';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildAccountNameHref } from '@/lib/auth-routing';
import { useBootstrap } from '@/lib/bootstrap-context';
import { cn } from '@/lib/utils';
import { THEME_PREFERENCE_OPTIONS, useTheme, type ThemePreference } from '@/lib/theme-context';
import { WELCOME_TOUR_OPEN_EVENT, welcomeTourAudience } from '@/lib/welcome-tour';

const THEME_ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Each person's own settings, for every role (#206): how Nkwapa looks, installing it, and what
 * this device holds. Clinic-wide controls stay at /settings/clinic.
 */
export default function SettingsPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const pathname = usePathname();
  const logout = useKeycloak()?.logout;
  const isStaff = bootstrap != null && welcomeTourAudience(bootstrap) === 'staff';

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Your account"
        title="Your settings"
        description="How Nkwapa looks and works for you on this device."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AppearanceCard />
        <InstallCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
            <CardDescription>
              Signed in as{' '}
              <span className="font-medium text-foreground">{bootstrap?.displayName ?? 'you'}</span>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {isStaff ? (
              <Button asChild variant="outline">
                <Link href={buildAccountNameHref(pathname)}>
                  <UserPen className="mr-2 h-4 w-4" aria-hidden="true" />
                  Change your name
                </Link>
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => window.dispatchEvent(new Event(WELCOME_TOUR_OPEN_EVENT))}
            >
              <Compass className="mr-2 h-4 w-4" aria-hidden="true" />
              Take the tour
            </Button>
            {logout ? (
              <Button variant="outline" className="text-destructive" onClick={() => void logout()}>
                <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                Log out
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">This device</CardTitle>
            <CardDescription>
              Changes you save without a connection wait here until they send. Support may ask for
              these details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeviceStorageDetails open />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AppearanceCard() {
  const { preference, setPreference } = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Appearance</CardTitle>
        <CardDescription>Applies on this device only.</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset>
          <legend className="sr-only">Theme</legend>
          <div className="grid grid-cols-3 gap-2">
            {THEME_PREFERENCE_OPTIONS.map((option) => {
              const Icon = THEME_ICONS[option.value];
              const selected = preference === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    'flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center text-sm transition-colors',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    selected
                      ? 'border-primary bg-primary/10 font-medium text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={selected}
                    onChange={() => setPreference(option.value)}
                    className="sr-only"
                  />
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

const MANUAL_STEPS_LABEL = { ios: 'Show me how', 'macos-safari': 'Show me how' } as const;

function InstallCard() {
  const { enabled, platform, canInstall, isInstalled, install } = useInstallAction();
  if (!enabled) return null;

  let status: React.ReactNode;
  if (isInstalled) {
    status = (
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
        Installed on this device
      </p>
    );
  } else if (canInstall) {
    status = (
      <Button onClick={install}>
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        {platform === 'chromium' ? 'Install app' : MANUAL_STEPS_LABEL[platform as 'ios']}
      </Button>
    );
  } else if (platform === 'chromium') {
    // No prompt to offer: either it is already installed, or the browser has not decided yet.
    status = (
      <p className="text-sm leading-6 text-muted-foreground">
        If Nkwapa is already installed, open it from your home screen or app list. Otherwise, use
        your browser&apos;s menu and choose <strong>Install Nkwapa</strong>.
      </p>
    );
  } else {
    status = (
      <p className="text-sm leading-6 text-muted-foreground">
        This browser can&apos;t install apps. Use Chrome or Edge, or Safari on iPhone, iPad and Mac.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />
          Install the app
        </CardTitle>
        <CardDescription>
          Opens straight into your workspace in its own window, and better protects changes saved on
          this device.
        </CardDescription>
      </CardHeader>
      <CardContent>{status}</CardContent>
    </Card>
  );
}
