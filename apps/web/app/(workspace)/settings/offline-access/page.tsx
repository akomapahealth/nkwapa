'use client';

import { displayTimeZone } from '@/lib/ops';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Fingerprint, LaptopMinimal, WifiOff } from 'lucide-react';
import { useKeycloak } from '@/app/KeycloakProvider';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { FieldError, fieldErrorProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, readApiError } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { db, type OfflineIdentityRecord } from '@/lib/db';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { canUseOfflineAccess } from '@/lib/offline-session/bootstrap';
import {
  OfflineGrantRefusedError,
  enableOfflineAccess,
  forgetOfflineIdentity,
  getDeviceId,
  revokeThisDevice,
} from '@/lib/offline-session/grant';
import { PIN_MIN_LENGTH, isAcceptablePin } from '@/lib/offline-session/keys';
import { canOfferPasskeyUnlock } from '@/lib/offline-session/webauthn';

interface DeviceGrant {
  id: string;
  deviceId: string;
  issuedAt: string;
  expiresAt: string;
  userAgent: string | null;
}

/**
 * "Use this device offline" (#207, R2, R8): turn it on with a PIN, see this device's state, and
 * withdraw it from any device. Everything here needs a connection except reading this device.
 */
export default function OfflineAccessPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const offlineSession = useKeycloak()?.authMode === 'offline-session';
  const userId = bootstrap?.userId ?? null;
  const [record, setRecord] = useState<OfflineIdentityRecord | null | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!userId) return;
    setRecord((await db.offline_identity.get(userId)) ?? null);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/settings">
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          Your settings
        </Link>
      </Button>
      <AppPageHeader
        title="Offline access"
        description="Work here with no connection. Unlock with a PIN; changes send when you're back online."
      />
      {!isWebFeatureEnabled('offlineSession') ? (
        <InlineNotice tone="info" live={false}>
          Offline access is not turned on for Nkwapa yet.
        </InlineNotice>
      ) : !canUseOfflineAccess(bootstrap) ? (
        <InlineNotice tone="info" live={false}>
          Offline access is for clinic staff. Administrator and patient accounts work online only.
        </InlineNotice>
      ) : (
        <>
          {offlineSession ? (
            <InlineNotice tone="warning" live={false}>
              You are in an offline session. Changing offline access needs a connection.
            </InlineNotice>
          ) : null}
          {record === undefined ? null : record ? (
            <ThisDeviceOn record={record} disabled={offlineSession} onChange={reload} />
          ) : (
            <TurnOn disabled={offlineSession} onChange={reload} />
          )}
          {offlineSession ? null : <YourDevices onChange={reload} />}
        </>
      )}
    </div>
  );
}

function TurnOn({ disabled, onChange }: { disabled: boolean; onChange: () => Promise<void> }) {
  const getToken = useAuth();
  const userId = useBootstrap()?.bootstrap?.userId;
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passkeyOffered, setPasskeyOffered] = useState(false);
  const [passkey, setPasskey] = useState(true);
  const [errors, setErrors] = useState<{ pin?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void canOfferPasskeyUnlock().then(setPasskeyOffered);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = {
      pin: isAcceptablePin(pin) ? undefined : `Use ${PIN_MIN_LENGTH} to 12 digits.`,
      confirm: pin === confirm ? undefined : 'The two PINs are different.',
    };
    setErrors(next);
    if (next.pin || next.confirm || !userId || !getToken) {
      document.getElementById(next.pin ? 'offline-new-pin' : 'offline-confirm-pin')?.focus();
      return;
    }
    setBusy(true);
    try {
      await enableOfflineAccess({ userId, getToken, pin, passkey: passkeyOffered && passkey });
      setPin('');
      setConfirm('');
      await onChange();
    } catch (error) {
      setErrors({ form: describeRefusal(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="text-lg">Use this device offline</RecordSectionTitle>
        <RecordSectionDescription>
          A PIN only you know, on a device your clinic trusts.
        </RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          {errors.form ? <InlineNotice tone="error">{errors.form}</InlineNotice> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="offline-new-pin">New PIN</Label>
              <Input
                id="offline-new-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={12}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                {...fieldErrorProps('offline-new-pin', errors.pin)}
              />
              <FieldError id="offline-new-pin" message={errors.pin} />
              <p className="text-sm text-muted-foreground">
                {PIN_MIN_LENGTH} to 12 digits. Five wrong tries remove offline access from the
                device.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offline-confirm-pin">Enter the PIN again</Label>
              <Input
                id="offline-confirm-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={12}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ''))}
                {...fieldErrorProps('offline-confirm-pin', errors.confirm)}
              />
              <FieldError id="offline-confirm-pin" message={errors.confirm} />
            </div>
          </div>
          {passkeyOffered ? (
            <div className="flex items-start gap-3 text-sm">
              <Checkbox
                id="offline-passkey"
                checked={passkey}
                onCheckedChange={(value) => setPasskey(value === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="offline-passkey" className="font-medium text-foreground">
                  Also unlock with fingerprint or face
                </Label>
                <p className="text-muted-foreground">
                  Asked once now. Your PIN keeps working either way.
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || disabled}>
              <WifiOff className="mr-2 h-4 w-4" aria-hidden="true" />
              {busy ? 'Turning on…' : 'Turn on offline access'}
            </Button>
          </div>
        </form>
      </RecordSectionContent>
    </RecordSection>
  );
}

function ThisDeviceOn({
  record,
  disabled,
  onChange,
}: {
  record: OfflineIdentityRecord;
  disabled: boolean;
  onChange: () => Promise<void>;
}) {
  const getToken = useAuth();
  const [busy, setBusy] = useState(false);

  const turnOff = async () => {
    const confirmed = await confirmAction({
      title: 'Turn off offline access on this device?',
      description:
        'Signing in here will need a connection. Saved changes stay and send after you sign in.',
      confirmLabel: 'Turn off',
    });
    if (!confirmed || !getToken) return;
    setBusy(true);
    try {
      await revokeThisDevice(record.userId, getToken);
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="flex items-center gap-2 text-lg">
          <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
          On for this device
        </RecordSectionTitle>
        <RecordSectionDescription>
          Works offline until {formatDateTime(record.expiresAt)}. Each online sign-in extends it.
        </RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-sm text-foreground">
          Unlock with{' '}
          <span className="font-medium">
            {record.passkey ? 'PIN, or fingerprint or face' : 'PIN'}
          </span>
          {record.passkey ? (
            <Fingerprint className="ml-1.5 inline h-4 w-4 text-primary" aria-hidden="true" />
          ) : null}
        </p>
        <Button
          variant="outline"
          className="ml-auto text-destructive"
          disabled={busy || disabled}
          onClick={() => void turnOff()}
        >
          {busy ? 'Turning off…' : 'Turn off on this device'}
        </Button>
      </RecordSectionContent>
    </RecordSection>
  );
}

function YourDevices({ onChange }: { onChange: () => Promise<void> }) {
  const getToken = useAuth();
  const userId = useBootstrap()?.bootstrap?.userId;
  const [grants, setGrants] = useState<DeviceGrant[] | null>(null);
  const [thisDevice, setThisDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken) return;
    try {
      const response = await apiFetch('/auth/offline-grants', { getToken, skipClinicHeader: true });
      if (!response.ok) throw await readApiError(response);
      setGrants(((await response.json()) as { grants: DeviceGrant[] }).grants);
      setError(null);
    } catch {
      setError('Could not load your devices. Check the connection and try again.');
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    void getDeviceId().then(setThisDevice);
  }, [load]);

  const revoke = async (grant: DeviceGrant) => {
    const isThis = grant.deviceId === thisDevice;
    const confirmed = await confirmAction({
      title: isThis ? 'Turn off offline access on this device?' : 'Sign out of this device?',
      description:
        'It can no longer be unlocked offline. Anything it already queued is refused when it next sends, and shows in its sync center.',
      confirmLabel: 'Turn off',
    });
    if (!confirmed || !getToken) return;
    setRevoking(grant.id);
    try {
      const response = await apiFetch(
        `/auth/offline-grants/${encodeURIComponent(grant.id)}/revoke`,
        {
          method: 'POST',
          getToken,
          skipClinicHeader: true,
          body: JSON.stringify({ reason: 'DEVICE_REVOKED' }),
        },
      );
      if (!response.ok) throw await readApiError(response);
      if (isThis && userId) await forgetOfflineIdentity(userId);
      await Promise.all([load(), onChange()]);
    } catch {
      setError('That device was not signed out. Check the connection and try again.');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="text-lg">Your devices</RecordSectionTitle>
        <RecordSectionDescription>
          Every device that can open your account offline. Turn off any you no longer use or have
          lost.
        </RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent className="space-y-3">
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        {grants === null ? (
          error ? null : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )
        ) : grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No device can open your account offline.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {grants.map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <LaptopMinimal
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="type-body font-medium text-foreground">
                    {describeDevice(grant.userAgent)}
                    {grant.deviceId === thisDevice ? (
                      <span className="ml-2 rounded-sm bg-selected px-1.5 py-0.5 text-xs font-medium text-primary">
                        This device
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Last signed in {formatDateTime(grant.issuedAt)}, offline until{' '}
                    {formatDateTime(grant.expiresAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoking !== null}
                  onClick={() => void revoke(grant)}
                >
                  {revoking === grant.id ? 'Turning off…' : 'Turn off'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </RecordSectionContent>
    </RecordSection>
  );
}

function describeRefusal(error: unknown): string {
  if (error instanceof OfflineGrantRefusedError) {
    if (error.code === 'OFFLINE_SESSION_NOT_ALLOWED')
      return 'This account cannot use offline access. It is for clinic staff only.';
    if (error.code === 'OFFLINE_SESSION_DISABLED' || error.code === 'OFFLINE_SESSION_UNAVAILABLE')
      return 'Offline access is not available right now. Try again later.';
    if (error.code === 'OFFLINE_GRANT_UNVERIFIED')
      return 'The server answered with something this device could not check. Try again.';
  }
  return 'Offline access was not turned on. Check the connection and try again.';
}

/** A readable name from the browser's own description. Nothing else identifies a device here. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const os = /iPhone|iPad|Android|Windows|Mac OS X|CrOS|Linux/.exec(userAgent)?.[0];
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const osName = os === 'Mac OS X' ? 'Mac' : os === 'CrOS' ? 'Chromebook' : os;
  return osName ? `${browser} on ${osName}` : browser;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: displayTimeZone(),
  }).format(new Date(iso));
}
