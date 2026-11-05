/**
 * The dashboard tab a multi-role person last opened, per user and clinic (#315). A per-viewer
 * convenience, so localStorage is enough; it throws in some privacy modes, hence the try/catch.
 */
function key(userId: string, clinicId: string) {
  return `nkwapa-dashboard-tab:${userId}:${clinicId}`;
}

export function readDashboardTab(userId: string, clinicId: string): string | null {
  try {
    return localStorage.getItem(key(userId, clinicId));
  } catch {
    return null;
  }
}

export function writeDashboardTab(userId: string, clinicId: string, tab: string) {
  try {
    localStorage.setItem(key(userId, clinicId), tab);
  } catch {
    // Not remembering the tab is harmless.
  }
}

/** The stored tab while the person still has it, otherwise the first. */
export function pickDashboardTab(stored: string | null, available: string[]): string | undefined {
  return stored && available.includes(stored) ? stored : available[0];
}
