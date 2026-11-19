import { OFFLINE_GRANT_ROLES, type OfflineGrantClaims } from '@nkwapa/db/offline-grant';
import type { ClinicUnits } from '@nkwapa/db/measurement-units';
import type { WhoAmIResponse } from '../bootstrap-context';

/**
 * The workspace identity an offline session runs on (#207, R5): the signed grant, in whoami's own
 * shape, so route guards, navigation and permission checks work unchanged. Nothing here grants
 * more than the grant says: memberships, roles and permissions come from it alone.
 */

const UNITS_STORAGE_KEY = 'nkwapa:clinicUnits';

/**
 * Each clinic's measurement units as the last online whoami reported them. Clinic configuration,
 * not patient data, so it is kept in the clear: an offline session must never label a glucose
 * reading in the wrong unit.
 */
export function rememberClinicUnits(bootstrap: Pick<WhoAmIResponse, 'memberships'>): void {
  try {
    const known = readClinicUnits();
    for (const membership of bootstrap.memberships) {
      if (membership.units) known[membership.clinicId] = membership.units;
    }
    localStorage.setItem(UNITS_STORAGE_KEY, JSON.stringify(known));
  } catch {
    // Storage blocked: offline sessions fall back to the default units.
  }
}

function readClinicUnits(): Record<string, Partial<ClinicUnits>> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(UNITS_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, Partial<ClinicUnits>>)
      : {};
  } catch {
    return {};
  }
}

export function whoamiFromGrant(
  claims: OfflineGrantClaims,
  requestedClinicId: string | null,
): WhoAmIResponse {
  const units = readClinicUnits();
  const active =
    claims.memberships.find((membership) => membership.clinicId === requestedClinicId) ??
    claims.memberships[0] ??
    null;
  return {
    userId: claims.userId,
    keycloakSub: '',
    displayName: claims.displayName,
    memberships: claims.memberships.map(({ clinicId, clinicName, roles }) => ({
      clinicId,
      clinicName,
      roles,
      units: units[clinicId] ?? null,
    })),
    globalRoles: [],
    activeClinicId: active?.clinicId ?? null,
    effectiveRolesForActiveClinic: active?.roles ?? [],
    effectivePermissionsForActiveClinic: active?.permissions ?? [],
    onboarding: null,
    source: 'offline-grant',
  };
}

let signedInUserId: string | null = null;

/** The account the last online whoami resolved, for sign-out to know whose offline access to ask about. */
export function setSignedInUserId(userId: string | null): void {
  signedInUserId = userId;
}

export function getSignedInUserId(): string | null {
  return signedInUserId;
}

/**
 * Whether this account may turn on offline access (R2), mirroring the API: a staff role at some
 * clinic and no global role. System admins and patients are never offered it.
 */
export function canUseOfflineAccess(
  bootstrap: Pick<WhoAmIResponse, 'globalRoles' | 'memberships'> | null | undefined,
): boolean {
  if (!bootstrap || bootstrap.globalRoles.length > 0) return false;
  const staff = new Set<string>(OFFLINE_GRANT_ROLES);
  return bootstrap.memberships.some((membership) =>
    membership.roles.some((role) => staff.has(role)),
  );
}
