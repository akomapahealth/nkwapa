'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { resetBootstrapResolved, type GetToken } from '@/lib/api';
import { setStoredActiveClinicId } from '@/lib/bootstrap-storage';
import { PageSkeleton } from '@/components/feedback/AppState';
import { OfflineLaunchScreen } from '@/components/pwa/OfflineLaunchScreen';
import {
  OfflineSessionGate,
  type UnlockedOfflineSession,
} from '@/components/offline-session/OfflineSessionGate';
import { IDLE_LOCK_MS, useIdleLock } from '@/components/offline-session/use-idle-lock';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { db } from '@/lib/db';
import { forgetNotificationsOnDevice } from '@/lib/browser-notifications';
import { canReachKeycloak, getKeycloak, initKeycloak, resetKeycloak } from '@/lib/keycloak';
import { isKeycloakCallback } from '@/lib/keycloak-callback';
import { clearPortalCache } from '@/lib/portal-cache';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { getSignedInUserId, setSignedInUserId } from '@/lib/offline-session/bootstrap';
import { revokeThisDevice } from '@/lib/offline-session/grant';
import {
  dropOfflineSession,
  holdOfflineSession,
  keepOfflineSessionAlive,
} from '@/lib/offline-session/hold';
import { dropAllKeys } from '@/lib/offline-session/keys';
import { lockOfflineSession } from '@/lib/offline-session/unlock';
import { setOutboxOfflineSession } from '@/lib/outbox';
import { settleShiftBeforeSignOut } from '@/lib/sign-out-shift';
import { AuthBootstrapWrapper } from './AuthBootstrapWrapper';
import { SyncWithAuth } from './SyncWithAuth';

export type AuthMode = 'online' | 'offline-session';

const KeycloakContext = createContext<{
  isReady: boolean;
  isAuthenticated: boolean;
  error: string | null;
  logout: () => void | Promise<void>;
  login: () => void;
  /**
   * 'offline-session' is an unlocked offline session (#207): identity from the device's signed
   * grant, no token, nothing sent until the person signs in with a connection.
   */
  authMode: AuthMode;
  /** Back to the unlock screen. Nothing is deleted; only an offline session has one. */
  lock?: () => void;
} | null>(null);

/** An offline session has no token: every online-only call fails as it would with no signal. */
const noToken: GetToken = async () => null;

/** How long sign-out waits for device cleanup before leaving anyway. */
const SIGN_OUT_CLEANUP_BUDGET_MS = 750;

export function useKeycloak() {
  const ctx = useContext(KeycloakContext);
  return ctx;
}

export function KeycloakProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [offlineSession, setOfflineSession] = useState<UnlockedOfflineSession | null>(null);

  const getToken: GetToken = useCallback(async () => {
    const kc = getKeycloak();
    if (!kc?.authenticated) return null;
    try {
      const refreshed = await kc.updateToken(30);
      if (refreshed && kc.token) {
        return kc.token;
      }
      return kc.token ?? null;
    } catch {
      return kc.token ?? null;
    }
  }, []);

  const logout = useCallback(async () => {
    const kc = getKeycloak();
    if (kc) {
      // First, while the session can still reach the server: a shift left running (#425).
      if (!(await settleShiftBeforeSignOut(getToken))) return;
      // R8: on a shared device the default is to take offline access away with the session.
      const userId = getSignedInUserId();
      if (
        userId &&
        isWebFeatureEnabled('offlineSession') &&
        (await db.offline_identity.get(userId))
      ) {
        const keep = await confirmAction({
          title: 'Keep offline access on this device?',
          description:
            'If you keep it, you can unlock this device with your PIN when there is no connection. Remove it on a shared or borrowed device.',
          confirmLabel: 'Keep offline access',
          cancelLabel: 'No, remove it',
          destructive: false,
        });
        if (!keep) await revokeThisDevice(userId, getToken);
      }
      setSignedInUserId(null);
      dropOfflineSession();
      // Drop per-session client state before leaving, so the next user to sign in on this
      // device is not bootstrapped with the previous user's clinic selection, and does not
      // inherit their saved portal history. A slow IndexedDB must not hold sign-out hostage:
      // whatever it fails to clear here is purged when the next account resolves. Background
      // pushes stop here too (#250); one that outlives the budget is dropped when it bounces.
      setStoredActiveClinicId(null);
      await Promise.race([
        Promise.all([clearPortalCache(db), forgetNotificationsOnDevice(getToken)]),
        new Promise((resolve) => setTimeout(resolve, SIGN_OUT_CLEANUP_BUDGET_MS)),
      ]);
      resetBootstrapResolved();
      // The at-rest keys leave memory with the session (#207).
      dropAllKeys();
      resetKeycloak();
      kc.logout();
    }
  }, [getToken]);

  const login = useCallback(() => {
    const kc = getKeycloak();
    if (kc) kc.login();
  }, []);

  useEffect(() => {
    const kc = getKeycloak();
    if (!kc) {
      setIsReady(true);
      setError('Keycloak not available (SSR)');
      return;
    }

    // Signing in needs Keycloak. With no connection, say so at once instead of waiting out the
    // timeout and then blaming sign-in (#206).
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }

    const timeout = setTimeout(() => {
      if (!navigator.onLine) {
        setOffline(true);
        return;
      }
      setIsReady(true);
      setError('Keycloak initialization timed out. Check your connection and try refreshing.');
    }, 15000);

    void canReachKeycloak().then((reachable) => {
      if (reachable) return;
      clearTimeout(timeout);
      setOffline(true);
    });

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    initKeycloak({
      onLoad: 'check-sso',
      /*
        Off (#172). The login-status iframe polls Keycloak to notice a session ended elsewhere,
        and enabling it costs two third-party-cookie probe pages plus the iframe itself, in series,
        before the first token on every page load. A session that ends is already caught here:
        `getToken` refreshes before every API call, and a refused refresh leaves the API answering
        401. The trade is that a sign-out in another tab is noticed on the next request, not
        within seconds.
      */
      checkLoginIframe: false,
      // Silent SSO restores a session on an ordinary page load. Returning from sign-in the code
      // is exchanged directly, so it is left out there: configuring it is what triggers the
      // third-party-cookie probe.
      ...(isKeycloakCallback(window.location)
        ? {}
        : { silentCheckSsoRedirectUri: `${origin}/silent-check-sso.html` }),
    })
      .then((authenticated) => {
        clearTimeout(timeout);
        // Online now: whatever offline session the worker held is over.
        dropOfflineSession();
        setIsAuthenticated(authenticated);
        setIsReady(true);
        setError(null);
      })
      .catch((err) => {
        clearTimeout(timeout);
        // fetch rejects with a TypeError when the network is down, even while onLine says true.
        // The message differs by browser: "Failed to fetch", "Load failed", "NetworkError ...".
        const networkFailure =
          err instanceof TypeError && /fetch|load failed|network/i.test(err.message);
        if (!navigator.onLine || networkFailure) {
          setOffline(true);
          return;
        }
        setError(err?.message ?? String(err));
        setIsReady(true);
      });

    return () => clearTimeout(timeout);
  }, []);

  const value = { isReady, isAuthenticated, error, logout, login, authMode: 'online' as const };

  const lock = useCallback(() => {
    dropOfflineSession();
    lockOfflineSession();
    setOutboxOfflineSession(null);
    setOfflineSession(null);
  }, []);

  const startOfflineSession = useCallback((session: UnlockedOfflineSession) => {
    // Every change queued from here carries the grant it was made under (R7).
    setOutboxOfflineSession({
      userId: session.claims.userId,
      stamp: {
        grantId: session.claims.grantId,
        deviceId: session.claims.deviceId,
        unlockMethod: session.unlockMethod,
      },
    });
    // Offline, every page change is a full load; the service worker keeps the session meanwhile.
    holdOfflineSession(session, IDLE_LOCK_MS);
    setOfflineSession(session);
  }, []);

  useIdleLock(offlineSession !== null, lock);
  useEffect(() => (offlineSession ? keepOfflineSessionAlive() : undefined), [offlineSession]);

  const offlineValue = useMemo(
    () => ({
      isReady: true,
      isAuthenticated: true,
      error: null,
      // Signing out needs Keycloak; with no connection it locks, so the next person can choose.
      logout: lock,
      // Signing in is the ordinary online start, so reload into it.
      login: () => window.location.reload(),
      authMode: 'offline-session' as const,
      lock,
    }),
    [lock],
  );

  if (offline) {
    if (!isWebFeatureEnabled('offlineSession')) return <OfflineLaunchScreen />;
    if (!offlineSession) return <OfflineSessionGate onUnlocked={startOfflineSession} />;
    return (
      <KeycloakContext.Provider value={offlineValue}>
        <AuthBootstrapWrapper
          key={offlineSession.claims.userId}
          getToken={noToken}
          offlineGrant={offlineSession.claims}
        >
          <SyncWithAuth>{children}</SyncWithAuth>
        </AuthBootstrapWrapper>
      </KeycloakContext.Provider>
    );
  }

  // Init errors set isReady too, so they surface on /login, which explains them and offers a retry.
  if (!isReady) {
    return (
      <KeycloakContext.Provider value={value}>
        <PageSkeleton title="Signing you in" description="Restoring your session." />
      </KeycloakContext.Provider>
    );
  }

  return (
    <KeycloakContext.Provider value={value}>
      <AuthBootstrapWrapper getToken={getToken}>
        <SyncWithAuth>{children}</SyncWithAuth>
      </AuthBootstrapWrapper>
    </KeycloakContext.Provider>
  );
}
