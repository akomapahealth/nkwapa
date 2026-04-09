'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  getErrorMessage,
  markBootstrapResolved,
  resetBootstrapResolved,
  type GetToken,
  readApiError,
} from './api';
import { getStoredActiveClinicId, setStoredActiveClinicId } from './bootstrap-storage';

export { BOOTSTRAP_STORAGE_KEY } from './bootstrap-storage';

export interface WhoAmIMembership {
  clinicId: string;
  clinicName: string;
  roles: string[];
}

export interface WhoAmIResponse {
  userId: string;
  keycloakSub: string;
  displayName: string;
  memberships: WhoAmIMembership[];
  globalRoles: string[];
  activeClinicId: string | null;
  effectiveRolesForActiveClinic: string[];
  effectivePermissionsForActiveClinic: string[];
  onboarding: {
    state: 'PATIENT_CLAIM_REQUIRED';
    pendingInvites: Array<{
      id: string;
      clinicId: string;
      clinicName: string;
      patientId: string;
      patientName: string;
      patientCode: string;
      email: string | null;
      phoneE164: string | null;
      createdAt: string;
      expiresAt: string | null;
    }>;
  } | null;
}

interface BootstrapContextValue {
  bootstrap: WhoAmIResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  errorCode: string | null;
  activeClinicId: string | null;
  setActiveClinicId: (id: string | null) => void;
  refetch: () => Promise<void>;
}

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function BootstrapProvider({
  children,
  getToken,
}: {
  children: React.ReactNode;
  getToken?: GetToken;
}) {
  const [bootstrap, setBootstrap] = useState<WhoAmIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(() => !!getToken);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activeClinicIdOverride, setActiveClinicIdOverride] = useState<string | null | undefined>(
    undefined,
  );

  const activeClinicId =
    activeClinicIdOverride !== undefined
      ? activeClinicIdOverride
      : (bootstrap?.activeClinicId ?? getStoredActiveClinicId());

  const setActiveClinicId = useCallback((id: string | null) => {
    setStoredActiveClinicId(id);
    setActiveClinicIdOverride(id);
  }, []);

  const fetchWhoami = useCallback(async () => {
    if (!getToken) return;

    const initialLoad = bootstrap == null;
    if (initialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    setErrorCode(null);
    try {
      const token = await getToken();
      if (!token) {
        setBootstrap(null);
        setErrorCode(null);
        resetBootstrapResolved();
        setStoredActiveClinicId(null);
        return;
      }

      const storedClinicId = getStoredActiveClinicId();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (storedClinicId) {
        // Hint the server with our last-selected clinic. If it turns out to
        // be stale, we'll reconcile against memberships below.
        headers['X-Clinic-Id'] = storedClinicId;
      }
      const res = await apiFetch('/auth/whoami', {
        headers,
        skipClinicHeader: true,
      });

      if (!res.ok) {
        throw await readApiError(res);
      }

      const data = (await res.json()) as WhoAmIResponse;
      setBootstrap(data);
      setErrorCode(null);

      // Reconcile the stored active clinic id against the server's truth.
      // The server only returns an activeClinicId the user actually has
      // access to, so we always mirror it back to localStorage (even when
      // null), and clear any stale override state.
      const membershipIds = new Set(data.memberships.map((m) => m.clinicId));
      const isSystemAdmin = data.globalRoles.includes('SYSTEM_ADMIN');
      const storedIsValid =
        !!storedClinicId && (isSystemAdmin || membershipIds.has(storedClinicId));

      if (!storedIsValid && storedClinicId) {
        // Stale value from a prior session (e.g. after a DB reseed or an
        // access-revocation) — drop it so subsequent requests don't send
        // a ghost clinic id in X-Clinic-Id.
        setActiveClinicIdOverride(undefined);
      }

      setStoredActiveClinicId(data.activeClinicId ?? null);
      markBootstrapResolved();
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error(String(e));
      const nextCode =
        'code' in nextError && typeof nextError.code === 'string' ? nextError.code : null;
      setError(getErrorMessage(nextError));
      setErrorCode(nextCode);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [bootstrap, getToken]);

  useEffect(() => {
    fetchWhoami();
  }, [fetchWhoami]);

  const value = useMemo(
    () => ({
      bootstrap,
      isLoading,
      isRefreshing,
      error,
      errorCode,
      activeClinicId,
      setActiveClinicId,
      refetch: fetchWhoami,
    }),
    [
      bootstrap,
      isLoading,
      isRefreshing,
      error,
      errorCode,
      activeClinicId,
      setActiveClinicId,
      fetchWhoami,
    ],
  );

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap() {
  const ctx = useContext(BootstrapContext);
  return ctx;
}
