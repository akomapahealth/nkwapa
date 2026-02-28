"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { GetToken } from "./api";
import {
  getStoredActiveClinicId,
  setStoredActiveClinicId,
} from "./bootstrap-storage";

export { BOOTSTRAP_STORAGE_KEY } from "./bootstrap-storage";

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
}

interface BootstrapContextValue {
  bootstrap: WhoAmIResponse | null;
  isLoading: boolean;
  error: string | null;
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeClinicIdOverride, setActiveClinicIdOverride] = useState<string | null | undefined>(undefined);

  const activeClinicId =
    activeClinicIdOverride !== undefined
      ? activeClinicIdOverride
      : bootstrap?.activeClinicId ?? getStoredActiveClinicId();

  const setActiveClinicId = useCallback((id: string | null) => {
    setStoredActiveClinicId(id);
    setActiveClinicIdOverride(id);
  }, []);

  const fetchWhoami = useCallback(async () => {
    if (!getToken) return;

    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setBootstrap(null);
        return;
      }

      const storedClinicId = getStoredActiveClinicId();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (storedClinicId) {
        headers["X-Clinic-Id"] = storedClinicId;
      }

      const API_BASE =
        process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
      const res = await fetch(`${API_BASE}/auth/whoami`, { headers });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `whoami failed: ${res.status}`);
      }

      const data = (await res.json()) as WhoAmIResponse;
      setBootstrap(data);

      if (data.activeClinicId) {
        setStoredActiveClinicId(data.activeClinicId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBootstrap(null);
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchWhoami();
  }, [fetchWhoami]);

  const value = useMemo(
    () => ({
      bootstrap,
      isLoading,
      error,
      activeClinicId,
      setActiveClinicId,
      refetch: fetchWhoami,
    }),
    [
      bootstrap,
      isLoading,
      error,
      activeClinicId,
      setActiveClinicId,
      fetchWhoami,
    ]
  );

  return (
    <BootstrapContext.Provider value={value}>
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap() {
  const ctx = useContext(BootstrapContext);
  return ctx;
}
