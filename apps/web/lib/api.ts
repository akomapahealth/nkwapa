import { getStoredActiveClinicId } from "./bootstrap-storage";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type GetToken = () => Promise<string | null>;

export interface ApiFetchOptions extends RequestInit {
  getToken?: GetToken;
  activeClinicId?: string | null;
  /** When true, do not send X-Clinic-Id header (e.g. for admin endpoints) */
  skipClinicHeader?: boolean;
}

export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { getToken, activeClinicId: explicitClinicId, skipClinicHeader, ...init } = options;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (getToken) {
    const token = await getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (!skipClinicHeader) {
    const clinicId =
      explicitClinicId !== undefined
        ? explicitClinicId
        : (typeof window !== "undefined" ? getStoredActiveClinicId() : null);
    if (clinicId) {
      headers.set("X-Clinic-Id", clinicId);
    }
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
