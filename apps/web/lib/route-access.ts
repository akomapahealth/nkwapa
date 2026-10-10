import type { WhoAmIResponse } from './bootstrap-context';

/**
 * What a guarded route should render.
 *
 * The distinction that matters: "we do not know yet" and "we know, and you may not" are
 * different answers. Collapsing them tells a director with perfectly good permissions that
 * they need to contact an administrator, when the real problem was a slow network.
 */
export type RouteAccessState =
  | 'resolving'
  | 'unavailable'
  | 'session-expired'
  | 'allowed'
  | 'denied';

export interface RouteAccessInput {
  bootstrap: WhoAmIResponse | null;
  isLoading: boolean;
  error: string | null;
  /** HTTP status of the failed bootstrap, when there was one. */
  errorStatus?: number | null;
  requiredPermission: string;
}

function grants(permissions: readonly string[], required: string): boolean {
  return permissions.includes('*') || permissions.includes(required);
}

export function resolveRouteAccess({
  bootstrap,
  isLoading,
  error,
  errorStatus = null,
  requiredPermission,
}: RouteAccessInput): RouteAccessState {
  // Once identity is known, answer from it even while a refresh is in flight, so switching
  // clinics or refetching never flashes a spurious access error.
  if (bootstrap) {
    const isSystemAdmin = bootstrap.globalRoles?.includes('SYSTEM_ADMIN') ?? false;
    const permissions = bootstrap.effectivePermissionsForActiveClinic ?? [];
    return isSystemAdmin || grants(permissions, requiredPermission) ? 'allowed' : 'denied';
  }

  // Still working, including while an automatic retry is pending.
  if (isLoading) return 'resolving';

  if (error) {
    return errorStatus === 401 || errorStatus === 403 ? 'session-expired' : 'unavailable';
  }

  // No identity, no error, not loading: bootstrap has not run to completion yet. This is
  // not a permission decision, so it must never render as one.
  return 'resolving';
}

/**
 * Backoff for automatic bootstrap retries.
 *
 * A transient failure on the very first identity load used to strand the user on a false
 * "no access" page until they hard-refreshed, so retryable failures are retried in place.
 * Non-retryable failures (401, 403) are surfaced immediately: retrying will not help.
 */
export const BOOTSTRAP_RETRY_DELAYS_MS = [500, 1500, 4000] as const;

export function getBootstrapRetryDelay(attempt: number, retryable: boolean): number | null {
  if (!retryable) return null;
  if (!Number.isInteger(attempt) || attempt < 0) return null;
  return attempt < BOOTSTRAP_RETRY_DELAYS_MS.length ? BOOTSTRAP_RETRY_DELAYS_MS[attempt] : null;
}
