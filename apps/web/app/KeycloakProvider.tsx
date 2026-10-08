'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { resetBootstrapResolved, type GetToken } from '@/lib/api';
import { setStoredActiveClinicId } from '@/lib/bootstrap-storage';
import { FullscreenStatus, PageSkeleton } from '@/components/feedback/AppState';
import { db } from '@/lib/db';
import { getKeycloak, initKeycloak, resetKeycloak } from '@/lib/keycloak';
import { isKeycloakCallback } from '@/lib/keycloak-callback';
import { clearPortalCache } from '@/lib/portal-cache';
import { AuthBootstrapWrapper } from './AuthBootstrapWrapper';
import { SyncWithAuth } from './SyncWithAuth';

const KeycloakContext = createContext<{
  isReady: boolean;
  isAuthenticated: boolean;
  error: string | null;
  logout: () => void | Promise<void>;
  login: () => void;
} | null>(null);

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
      // Drop per-session client state before leaving, so the next user to sign in on this
      // device is not bootstrapped with the previous user's clinic selection, and does not
      // inherit their saved portal history. A slow IndexedDB must not hold sign-out hostage:
      // whatever it fails to clear here is purged when the next account resolves.
      setStoredActiveClinicId(null);
      await Promise.race([
        clearPortalCache(db),
        new Promise((resolve) => setTimeout(resolve, SIGN_OUT_CLEANUP_BUDGET_MS)),
      ]);
      resetBootstrapResolved();
      resetKeycloak();
      kc.logout();
    }
  }, []);

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

    const timeout = setTimeout(() => {
      setIsReady(true);
      setError('Keycloak initialization timed out. Check your connection and try refreshing.');
    }, 15000);

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
        setIsAuthenticated(authenticated);
        setIsReady(true);
        setError(null);
      })
      .catch((err) => {
        clearTimeout(timeout);
        setError(err?.message ?? String(err));
        setIsReady(true);
      });

    return () => clearTimeout(timeout);
  }, []);

  const value = { isReady, isAuthenticated, error, logout, login };

  if (!isReady) {
    return (
      <KeycloakContext.Provider value={value}>
        {error ? (
          <FullscreenStatus
            eyebrow="Authentication"
            title="We couldn't finish secure sign in"
            description={error}
          />
        ) : (
          <PageSkeleton
            title="Starting secure access"
            description="Connecting to Keycloak, restoring your session, and preparing the safest route into the app."
          />
        )}
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
