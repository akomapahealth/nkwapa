'use client';

import { useEffect, useState } from 'react';
import { LockKeyhole, LogIn, WifiOff } from 'lucide-react';
import { useKeycloak } from '@/app/KeycloakProvider';
import { Button } from '@/components/ui/button';
import { useBootstrap } from '@/lib/bootstrap-context';
import { canReachKeycloak } from '@/lib/keycloak';

const RECHECK_MS = 15_000;

/**
 * Says, on every page of an offline session, whose session it is and that nothing has been sent
 * (#207, R5). When sign-in is reachable again it asks the person to sign in (R7), rather than
 * reloading by itself: a reload would drop whatever they are typing.
 */
export function OfflineSessionBanner() {
  const keycloak = useKeycloak();
  if (keycloak?.authMode !== 'offline-session') return null;
  return <Banner lock={keycloak.lock} login={keycloak.login} />;
}

function Banner({ lock, login }: { lock?: () => void; login: () => void }) {
  const displayName = useBootstrap()?.bootstrap?.displayName;
  // Whether sign-in can actually reach Keycloak. navigator.onLine stays true on a device with
  // bars but no data, so it cannot say the connection is back (#206).
  const [isOnline, setIsOnline] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => void canReachKeycloak().then((reachable) => live && setIsOnline(reachable));
    check();
    window.addEventListener('online', check);
    const poll = window.setInterval(check, RECHECK_MS);
    return () => {
      live = false;
      window.removeEventListener('online', check);
      window.clearInterval(poll);
    };
  }, []);

  return (
    <section
      aria-label="Offline session"
      className="flex flex-col gap-3 rounded-md border border-warning/25 print:hidden bg-warning/10 px-4 py-3 text-warning-ink sm:flex-row sm:items-center"
    >
      <WifiOff aria-hidden="true" className="hidden h-5 w-5 shrink-0 sm:block" />
      <p className="type-body min-w-0 flex-1 text-pretty" data-testid="offline-session-banner">
        {isOnline ? (
          <>
            <span className="font-semibold">The connection is back.</span> Sign in to send the
            changes saved in this offline session.
          </>
        ) : (
          <>
            <span className="font-semibold">Offline session as {displayName}.</span> Changes will
            send after you sign in with a connection.
          </>
        )}
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={lock}>
          <LockKeyhole aria-hidden="true" className="h-4 w-4" />
          Lock
        </Button>
        {isOnline ? (
          <Button size="sm" onClick={login}>
            <LogIn aria-hidden="true" className="h-4 w-4" />
            Sign in to send changes
          </Button>
        ) : null}
      </div>
    </section>
  );
}
