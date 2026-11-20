'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Fingerprint, LockKeyhole, UserRound } from 'lucide-react';
import type { OfflineGrantClaims } from '@nkwapa/db/offline-grant';
import { FullscreenStatus, PageSkeleton } from '@/components/feedback/AppState';
import { OfflineLaunchScreen } from '@/components/pwa/OfflineLaunchScreen';
import { Button } from '@/components/ui/button';
import { FieldError, fieldErrorProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usableOfflineIdentities } from '@/lib/offline-session/grant';
import { resumeOfflineSession } from '@/lib/offline-session/hold';
import { PIN_MIN_LENGTH } from '@/lib/offline-session/keys';
import {
  unlockWithPasskey,
  unlockWithPin,
  type UnlockMethod,
  type UnlockResult,
} from '@/lib/offline-session/unlock';

type Identity = Awaited<ReturnType<typeof usableOfflineIdentities>>[number];

export interface UnlockedOfflineSession {
  claims: OfflineGrantClaims;
  unlockMethod: UnlockMethod;
}

/**
 * What a cold start with no connection shows on a device someone opted in on (#207, R5): choose
 * who you are when several people did, then unlock. With nobody who can resume here, it is the
 * plain #206 offline screen. Display names only; nothing about patients appears before unlock.
 */
export function OfflineSessionGate({
  onUnlocked,
}: {
  onUnlocked: (session: UnlockedOfflineSession) => void;
}) {
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    usableOfflineIdentities()
      .then((rows) => {
        setIdentities(rows);
        setChosen((current) =>
          rows.some((row) => row.userId === current)
            ? current
            : rows.length === 1
              ? rows[0].userId
              : null,
        );
      })
      .catch(() => setIdentities([]));

  useEffect(() => {
    // A page change inside an unlocked session: the service worker still holds it.
    void resumeOfflineSession().then((held) => {
      if (held && Date.parse(held.claims.expiresAt) > Date.now()) onUnlocked(held);
      else void load();
    });
    // Nobody is signed in yet, so nothing is lost by trying the ordinary sign-in again.
    const retry = () => window.location.reload();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
    // Once, on mount: a later onUnlocked identity does not restart the check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (identities === null) {
    return <PageSkeleton title="Checking this device" description="One moment." />;
  }
  if (identities.length === 0) return <OfflineLaunchScreen notice={notice} />;

  const identity = identities.find((row) => row.userId === chosen);
  if (!identity) {
    return (
      <FullscreenStatus
        icon={UserRound}
        title="Who is using this device?"
        description="You are offline. Choose your name to unlock. Changes send after you next sign in online."
        detail={
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {identities.map((row) => (
              <li key={row.userId}>
                <button
                  type="button"
                  onClick={() => setChosen(row.userId)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-selected"
                >
                  <span className="min-w-0 flex-1">
                    <span className="type-body block truncate font-medium text-foreground">
                      {row.displayName}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Offline access until {formatUntil(row.expiresAt)}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        }
      />
    );
  }

  return (
    <UnlockForm
      key={identity.userId}
      identity={identity}
      canChooseAnother={identities.length > 1}
      onChooseAnother={() => setChosen(null)}
      onUnlocked={onUnlocked}
      onGone={(message) => {
        setNotice(message);
        setChosen(null);
        void load();
      }}
    />
  );
}

function UnlockForm({
  identity,
  canChooseAnother,
  onChooseAnother,
  onUnlocked,
  onGone,
}: {
  identity: Identity;
  canChooseAnother: boolean;
  onChooseAnother: () => void;
  onUnlocked: (session: UnlockedOfflineSession) => void;
  /** This person can no longer unlock here: locked out, expired or removed. */
  onGone: (message: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState<UnlockMethod | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const settle = (result: UnlockResult) => {
    if (result.ok) {
      onUnlocked({ claims: result.claims, unlockMethod: result.unlockMethod });
      return;
    }
    switch (result.reason) {
      case 'wrong-pin':
        setPin('');
        setError(
          result.attemptsLeft === 1
            ? 'That PIN is not right. 1 try left before offline access is removed from this device.'
            : `That PIN is not right. ${result.attemptsLeft} tries left.`,
        );
        shake(inputRef.current);
        inputRef.current?.focus();
        return;
      case 'passkey-unavailable':
        setError('Fingerprint or face did not unlock. Use your PIN instead.');
        inputRef.current?.focus();
        return;
      case 'locked-out':
        onGone(
          `Offline access for ${identity.displayName} was removed from this device after 5 wrong tries. Changes already saved here are safe and send after they sign in with a connection.`,
        );
        return;
      case 'expired':
        onGone(
          `Offline access for ${identity.displayName} has expired. Sign in with a connection to turn it on again. Changes already saved here are safe.`,
        );
        return;
      default:
        onGone(
          `Offline access for ${identity.displayName} can no longer be opened on this device. Sign in with a connection to set it up again. Changes already saved here are safe.`,
        );
    }
  };

  const submitPin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (pin.length < PIN_MIN_LENGTH) {
      setError(`Enter your PIN. It is at least ${PIN_MIN_LENGTH} digits.`);
      inputRef.current?.focus();
      return;
    }
    setBusy('pin');
    setError(undefined);
    try {
      settle(await unlockWithPin(identity.userId, pin));
    } finally {
      setBusy(null);
    }
  };

  const unlockWithDevicePasskey = async () => {
    if (busy) return;
    setBusy('webauthn');
    setError(undefined);
    try {
      settle(await unlockWithPasskey(identity.userId));
    } finally {
      setBusy(null);
    }
  };

  return (
    <FullscreenStatus
      icon={LockKeyhole}
      title={`Unlock as ${identity.displayName}`}
      description="You are offline. Enter your PIN to keep working. Changes send after you next sign in online."
      detail={
        <form onSubmit={submitPin} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="offline-pin">Offline PIN</Label>
            <Input
              ref={inputRef}
              id="offline-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={12}
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, ''));
                if (error) setError(undefined);
              }}
              className="text-lg tracking-[0.3em]"
              {...fieldErrorProps('offline-pin', error)}
            />
            <FieldError id="offline-pin" message={error} reserveSpace />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {canChooseAnother ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                onClick={onChooseAnother}
              >
                Not {firstName(identity.displayName)}?
              </Button>
            ) : null}
            {identity.hasPasskey ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void unlockWithDevicePasskey()}
                disabled={busy !== null}
              >
                <Fingerprint aria-hidden="true" className="h-4 w-4" />
                {busy === 'webauthn' ? 'Waiting…' : 'Use fingerprint or face'}
              </Button>
            ) : null}
            <Button type="submit" disabled={busy !== null}>
              {busy === 'pin' ? 'Unlocking…' : 'Unlock'}
            </Button>
          </div>
        </form>
      }
    />
  );
}

/** One short, decaying shake on a wrong PIN; none at all with reduced motion (the text says it). */
function shake(element: HTMLElement | null) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 280, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  );
}

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

function formatUntil(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Accra',
  }).format(new Date(iso));
}
