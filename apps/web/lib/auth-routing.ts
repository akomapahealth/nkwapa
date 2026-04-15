import type { WhoAmIResponse } from './bootstrap-context';

export function getSafeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) {
    return null;
  }

  if (next.startsWith('//') || next === '/login') {
    return null;
  }

  return next;
}

export function buildLoginHref(next: string | null | undefined): string {
  const safeNext = getSafeNextPath(next);
  if (!safeNext) {
    return '/login';
  }

  const params = new URLSearchParams({ next: safeNext });
  return `/login?${params.toString()}`;
}

export function getDefaultWorkspacePath(bootstrap: WhoAmIResponse | null): string {
  const requiresPatientClaim = bootstrap?.onboarding?.state === 'PATIENT_CLAIM_REQUIRED';
  if (requiresPatientClaim) {
    return '/claim-record';
  }

  const roles = bootstrap?.effectiveRolesForActiveClinic ?? bootstrap?.globalRoles ?? [];
  const isPatientOnly = roles.length === 1 && roles[0] === 'PATIENT';
  return isPatientOnly ? '/portal' : '/dashboard';
}

export function getPostAuthPath(
  bootstrap: WhoAmIResponse | null,
  next: string | null | undefined,
): string {
  const defaultPath = getDefaultWorkspacePath(bootstrap);
  if (defaultPath === '/claim-record') {
    return defaultPath;
  }

  return getSafeNextPath(next) ?? defaultPath;
}
