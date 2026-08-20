'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ApiError,
  apiFetch,
  getErrorMessage,
  markBootstrapResolved,
  resetBootstrapResolved,
  type GetToken,
  readApiError,
} from './api';
import { getBootstrapRetryDelay } from './route-access';
import {
  getBootstrapActiveClinicId,
  isStoredClinicIdValid,
  type BootstrapClinic,
} from './bootstrap-clinics';
import { getStoredActiveClinicId, setStoredActiveClinicId } from './bootstrap-storage';

export { BOOTSTRAP_STORAGE_KEY } from './bootstrap-storage';

export interface WhoAmIMembership {
  clinicId: string;
  clinicName: string;
  roles: string[];
}

export type WhoAmIAvailableClinic = BootstrapClinic;

export interface WhoAmIResponse {
  userId: string;
  keycloakSub: string;
  displayName: string;
  memberships: WhoAmIMembership[];
  availableClinics?: WhoAmIAvailableClinic[];
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
  /** True while identity is unresolved, including while an automatic retry is pending. */
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  errorCode: string | null;
  errorStatus: number | null;
  activeClinicId: string | null;
  setActiveClinicId: (id: string | null) => void;
  refetch: () => Promise<void>;
  /** Clears the retry budget and loads identity again, for a user-initiated retry. */
  retry: () => void;
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
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [activeClinicIdOverride, setActiveClinicIdOverride] = useState<string | null | undefined>(
    undefined,
  );
  const bootstrapRef = useRef<WhoAmIResponse | null>(null);

  // Identity is the gate for every guarded route, so a transient failure here must not be
  // mistaken for "no access". Retryable failures are retried in place, and the provider
  // keeps reporting "loading" until the budget is spent.
  const [retryPending, setRetryPending] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(
    (retryable: boolean) => {
      const delay = getBootstrapRetryDelay(retryAttemptRef.current, retryable);
      if (delay === null) return false;
      retryAttemptRef.current += 1;
      clearRetryTimer();
      setRetryPending(true);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRetryTick((tick) => tick + 1);
      }, delay);
      return true;
    },
    [clearRetryTimer],
  );

  useEffect(() => clearRetryTimer, [clearRetryTimer]);

  const activeClinicId =
    activeClinicIdOverride !== undefined
      ? activeClinicIdOverride
      : (getBootstrapActiveClinicId(bootstrap) ?? getStoredActiveClinicId());

  const setActiveClinicId = useCallback((id: string | null) => {
    setStoredActiveClinicId(id);
    setActiveClinicIdOverride(id);
  }, []);

  const fetchWhoami = useCallback(async () => {
    if (!getToken) return;

    const initialLoad = bootstrapRef.current == null;
    if (initialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    setErrorCode(null);
    setErrorStatus(null);
    try {
      const token = await getToken();
      if (!token) {
        // The session may simply not have settled yet (a redirect back from Keycloak, or a
        // token refresh in flight). Retry before concluding the user is signed out, so a
        // race does not present itself as a permissions problem.
        if (initialLoad && scheduleRetry(true)) {
          return;
        }
        bootstrapRef.current = null;
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
      bootstrapRef.current = data;
      setBootstrap(data);
      setErrorCode(null);

      // Reconcile the stored active clinic id against the server's truth.
      // The server only returns an activeClinicId the user actually has
      // access to, so we always mirror it back to localStorage (even when
      // null), and clear any stale override state.
      const storedIsValid = isStoredClinicIdValid(data, storedClinicId);

      if (!storedIsValid && storedClinicId) {
        // Stale value from a prior session (e.g. after a DB reseed or an
        // access-revocation) — drop it so subsequent requests don't send
        // a ghost clinic id in X-Clinic-Id.
        setActiveClinicIdOverride(undefined);
      }

      setStoredActiveClinicId(data.activeClinicId ?? null);
      markBootstrapResolved();
      retryAttemptRef.current = 0;
      setRetryPending(false);
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error(String(e));
      const nextCode =
        'code' in nextError && typeof nextError.code === 'string' ? nextError.code : null;
      const nextStatus = nextError instanceof ApiError ? nextError.status : null;
      const isRetryable = nextError instanceof ApiError ? nextError.retryable : true;

      // Only surface the failure once retrying cannot help, or the budget is spent.
      // Until then the route keeps showing its loading state rather than a false denial.
      if (initialLoad && scheduleRetry(isRetryable)) {
        return;
      }

      setError(getErrorMessage(nextError));
      setErrorCode(nextCode);
      setErrorStatus(nextStatus);
      setRetryPending(false);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getToken, scheduleRetry]);

  useEffect(() => {
    void fetchWhoami();
  }, [fetchWhoami, retryTick]);

  const retry = useCallback(() => {
    clearRetryTimer();
    retryAttemptRef.current = 0;
    setRetryPending(false);
    setRetryTick((tick) => tick + 1);
  }, [clearRetryTimer]);

  // Coming back online is the most likely moment a failed identity load will succeed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      if (bootstrapRef.current == null) retry();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [retry]);

  const value = useMemo(
    () => ({
      bootstrap,
      // A pending retry is still "loading" as far as guarded routes are concerned.
      isLoading: isLoading || retryPending,
      isRefreshing,
      error,
      errorCode,
      errorStatus,
      activeClinicId,
      setActiveClinicId,
      refetch: fetchWhoami,
      retry,
    }),
    [
      bootstrap,
      isLoading,
      retryPending,
      isRefreshing,
      error,
      errorCode,
      errorStatus,
      activeClinicId,
      setActiveClinicId,
      fetchWhoami,
      retry,
    ],
  );

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap() {
  const ctx = useContext(BootstrapContext);
  return ctx;
}
