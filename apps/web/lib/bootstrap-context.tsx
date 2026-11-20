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
import { setDisplayTimeZone } from './ops';
import {
  getBootstrapActiveClinicId,
  getClinicTimeZone,
  getClinicUnits,
  isStoredClinicIdValid,
  type BootstrapClinic,
} from './bootstrap-clinics';
import type { ClinicUnits } from '@nkwapa/db/measurement-units';
import { getStoredActiveClinicId, setStoredActiveClinicId } from './bootstrap-storage';
import { isWebFeatureEnabled } from './feature-flags';
import {
  rememberClinicUnits,
  setSignedInUserId,
  whoamiFromGrant,
} from './offline-session/bootstrap';
import type { OfflineGrantClaims } from '@nkwapa/db/offline-grant';
import type { PendingStaffInvite } from './staff-invite';

export { BOOTSTRAP_STORAGE_KEY } from './bootstrap-storage';

export interface WhoAmIMembership {
  clinicId: string;
  clinicName: string;
  roles: string[];
  units?: Partial<ClinicUnits> | null;
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
  /**
   * Staff invitations this account can accept, whatever roles it already holds. Optional so an
   * older API that does not send it still parses.
   */
  pendingStaffInvites?: PendingStaffInvite[];
  onboarding:
    | { state: 'STAFF_INVITE_ACCEPT_REQUIRED' }
    | { state: 'NAME_REQUIRED' }
    | { state: 'AGREEMENT_REQUIRED' }
    | {
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
      }
    | null;
  /**
   * The welcome tour version this person last finished or skipped. Optional so an older API
   * still parses; the tour is simply not offered then.
   */
  welcomeTour?: { completedVersion: number | null };
  /**
   * The confidentiality agreement (#330). Optional so an older API still parses; nobody is then
   * held on the agreement step.
   */
  staffAgreement?: { required: boolean; signedVersion: number | null; acceptedAt: string | null };
  /**
   * The person's own name (#225). Optional so an older API still parses; nobody is then held on
   * the name step.
   */
  /**
   * Where this identity came from. 'offline-grant' is an offline session (#207): read from the
   * device's signed grant, with no token behind it. Absent means a live whoami.
   */
  source?: 'offline-grant';
  profile?: {
    needsName: boolean;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    email: string | null;
    /** Optional so an older API still parses. */
    phoneE164?: string | null;
  };
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
  /**
   * Moves the workspace to another clinic. Resolves once identity and permissions follow, with
   * whether the server now has that clinic active.
   */
  setActiveClinicId: (id: string | null) => Promise<boolean>;
  refetch: () => Promise<void>;
  /** Clears the retry budget and loads identity again, for a user-initiated retry. */
  retry: () => void;
}

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function BootstrapProvider({
  children,
  getToken,
  offlineGrant,
}: {
  children: React.ReactNode;
  getToken?: GetToken;
  /** An unlocked offline session's grant (#207). Identity comes from it, and whoami is not called. */
  offlineGrant?: OfflineGrantClaims | null;
}) {
  const [bootstrap, setBootstrap] = useState<WhoAmIResponse | null>(() =>
    offlineGrant ? whoamiFromGrant(offlineGrant, getStoredActiveClinicId()) : null,
  );
  const [isLoading, setIsLoading] = useState(() => !!getToken && !offlineGrant);
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
  // Set during render, before children format a date: every clock time and "today" follow it.
  setDisplayTimeZone(getClinicTimeZone(bootstrap, activeClinicId));

  const fetchWhoami = useCallback(async () => {
    if (offlineGrant) {
      // An offline session: the grant is the whole truth, and nothing here needs the network.
      const data = whoamiFromGrant(offlineGrant, getStoredActiveClinicId());
      bootstrapRef.current = data;
      setBootstrap(data);
      setStoredActiveClinicId(data.activeClinicId);
      markBootstrapResolved();
      return;
    }
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
      // The at-rest keys arrive before the workspace opens (#207). A failed fetch (the signal
      // dropping right here, say) does not fail sign-in: the at-rest layer refuses clinical saves
      // without a key and says so, and the next whoami tries again.
      if (isWebFeatureEnabled('offlineSession')) {
        rememberClinicUnits(data);
        // Loaded only with the flag on, so the local database stays out of every page's bootstrap.
        // An opted-in device refreshes its grant here too, at most hourly (R1).
        await import('./offline-session/grant')
          .then(({ fetchDeviceKeys, refreshOfflineAccess }) =>
            Promise.all([
              fetchDeviceKeys(getToken, data.activeClinicId),
              refreshOfflineAccess(data.userId, getToken).catch(() => undefined),
            ]),
          )
          .catch(() => undefined);
      }
      bootstrapRef.current = data;
      setBootstrap(data);
      setSignedInUserId(data.userId);
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
  }, [getToken, offlineGrant, scheduleRetry]);

  useEffect(() => {
    void fetchWhoami();
  }, [fetchWhoami, retryTick]);

  /*
    Pages read the clinic and its permissions from whoami (`bootstrap.activeClinicId`,
    `effectivePermissionsForActiveClinic`), so moving only the stored id left every screen on the
    old clinic until a reload. fetchWhoami sends the stored id as X-Clinic-Id.
  */
  const setActiveClinicId = useCallback(
    async (id: string | null) => {
      setStoredActiveClinicId(id);
      setActiveClinicIdOverride(id);
      await fetchWhoami();
      const current = bootstrapRef.current?.activeClinicId ?? null;
      if (current === id) return true;
      // Refused or failed: fall back to the clinic whoami still has, so the header and pages agree.
      setStoredActiveClinicId(current);
      setActiveClinicIdOverride(undefined);
      return false;
    },
    [fetchWhoami],
  );

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

/** The units of `clinicId`, or of the active clinic, as whoami last reported them. */
export function useClinicUnits(clinicId?: string | null): ClinicUnits {
  const ctx = useContext(BootstrapContext);
  return getClinicUnits(ctx?.bootstrap, clinicId ?? ctx?.activeClinicId);
}
