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
  errorCode: string | null;
  activeClinicId: string | null;
  setActiveClinicId: (id: string | null) => void;
  refetch: () => Promise<void>;
}

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

function parseBootstrapError(raw: string, status: number) {
  if (!raw) {
    return {
      message: `whoami failed: ${status}`,
      code: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as
      | { message?: string | string[]; code?: string }
      | string;

    if (typeof parsed === "string") {
      return {
        message: parsed,
        code: null,
      };
    }

    const message = Array.isArray(parsed.message)
      ? parsed.message.join(", ")
      : parsed.message ?? `whoami failed: ${status}`;

    return {
      message,
      code: parsed.code ?? null,
    };
  } catch {
    return {
      message: raw,
      code: null,
    };
  }
}

export function BootstrapProvider({
  children,
  getToken,
}: {
  children: React.ReactNode;
  getToken?: GetToken;
}) {
  const [bootstrap, setBootstrap] = useState<WhoAmIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(() => !!getToken);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
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
    setErrorCode(null);
    try {
      const token = await getToken();
      if (!token) {
        setBootstrap(null);
        setErrorCode(null);
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
        const parsedError = parseBootstrapError(text, res.status);
        const error = new Error(parsedError.message) as Error & { code?: string };
        error.code = parsedError.code ?? undefined;
        throw error;
      }

      const data = (await res.json()) as WhoAmIResponse;
      setBootstrap(data);
      setErrorCode(null);

      if (data.activeClinicId) {
        setStoredActiveClinicId(data.activeClinicId);
      }
    } catch (e) {
      const nextError =
        e instanceof Error ? e : new Error(String(e));
      const nextCode =
        "code" in nextError && typeof nextError.code === "string"
          ? nextError.code
          : null;
      setError(nextError.message);
      setErrorCode(nextCode);
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
      errorCode,
      activeClinicId,
      setActiveClinicId,
      refetch: fetchWhoami,
    }),
    [
      bootstrap,
      isLoading,
      error,
      errorCode,
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
