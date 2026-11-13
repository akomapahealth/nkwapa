'use client';

import Link from 'next/link';
import {
  CheckCircle2,
  Bell,
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
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { useBootstrap } from '@/lib/bootstrap-context';
import { cn } from '@/lib/utils';
import { THEME_PREFERENCE_OPTIONS, useTheme, type ThemePreference } from '@/lib/theme-context';
import { WELCOME_TOUR_OPEN_EVENT } from '@/lib/welcome-tour';

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
  const logout = useKeycloak()?.logout;

  return (
    <div className="max-w-3xl space-y-6">
      <AppPageHeader
        title="Your settings"
        description="How Nkwapa looks and works for you on this device."
      />

      <div className="space-y-6">
        <AppearanceCard />
        <RecordSection>
          <RecordSectionHeader>
            <RecordSectionTitle>Notifications</RecordSectionTitle>
            <RecordSectionDescription>Alerts on this device.</RecordSectionDescription>
          </RecordSectionHeader>
          <RecordSectionContent>
            <Button asChild variant="outline">
              <Link href="/account#notifications">
                <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
                Manage notifications
              </Link>
            </Button>
          </RecordSectionContent>
        </RecordSection>
        <InstallCard />

        <RecordSection>
          <RecordSectionHeader>
            <RecordSectionTitle className="text-lg">This device</RecordSectionTitle>
            <RecordSectionDescription>
              Changes you save without a connection wait here until they send. Support may ask for
              these details.
            </RecordSectionDescription>
          </RecordSectionHeader>
          <RecordSectionContent>
            <DeviceStorageDetails open />
          </RecordSectionContent>
        </RecordSection>

        <RecordSection>
          <RecordSectionHeader>
            <RecordSectionTitle className="text-lg">Account</RecordSectionTitle>
            <RecordSectionDescription>
              Signed in as{' '}
              <span className="font-medium text-foreground">{bootstrap?.displayName ?? 'you'}</span>
              .
            </RecordSectionDescription>
          </RecordSectionHeader>
          <RecordSectionContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/account">
                <UserPen className="mr-2 h-4 w-4" aria-hidden="true" />
                Manage profile
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => window.dispatchEvent(new Event(WELCOME_TOUR_OPEN_EVENT))}
            >
              <Compass className="mr-2 h-4 w-4" aria-hidden="true" />
              Take the tour
            </Button>
            {logout ? (
              <Button
                variant="outline"
                className="ml-auto text-destructive"
                onClick={() => void logout()}
              >
                <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                Log out
              </Button>
            ) : null}
          </RecordSectionContent>
        </RecordSection>
      </div>
    </div>
  );
}

function AppearanceCard() {
  const { preference, setPreference } = useTheme();
  return (
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="text-lg">Appearance</RecordSectionTitle>
        <RecordSectionDescription>Applies on this device only.</RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent>
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
      </RecordSectionContent>
    </RecordSection>
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
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />
          Install the app
        </RecordSectionTitle>
        <RecordSectionDescription>
          {isInstalled
            ? 'Nkwapa is ready to open from your app list.'
            : 'Open your workspace in its own window.'}
        </RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent>{status}</RecordSectionContent>
    </RecordSection>
  );
}
