'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { GetToken } from '@/lib/api';
import { FullscreenStatus, PageSkeleton } from '@/components/feedback/AppState';
import { getKeycloak, initKeycloak, resetKeycloak } from '@/lib/keycloak';
import { AuthBootstrapWrapper } from './AuthBootstrapWrapper';
import { SyncWithAuth } from './SyncWithAuth';

const KeycloakContext = createContext<{
  isReady: boolean;
  isAuthenticated: boolean;
  error: string | null;
  logout: () => void;
  login: () => void;
} | null>(null);

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

  const logout = useCallback(() => {
    const kc = getKeycloak();
    if (kc) {
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
      checkLoginIframe: true,
      silentCheckSsoRedirectUri: `${origin}/silent-check-sso.html`,
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
