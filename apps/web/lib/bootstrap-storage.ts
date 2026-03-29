export const BOOTSTRAP_STORAGE_KEY = "nkwapa:activeClinicId";

export function getStoredActiveClinicId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(BOOTSTRAP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredActiveClinicId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      localStorage.setItem(BOOTSTRAP_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(BOOTSTRAP_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
