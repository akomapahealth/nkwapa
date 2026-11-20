import { resolveClinicUnits, type ClinicUnits } from '@nkwapa/db/measurement-units';
import { OPS_DEFAULT_TIMEZONE as CLINIC_DEFAULT_TIMEZONE } from '@/lib/ops';

export interface BootstrapClinic {
  clinicId: string;
  clinicName: string;
  /**
   * The clinic's reporting zone, or `null`.
   *
   * Optional because an older API build does not send it, and a missing zone must read as "no
   * zone" rather than take a screen down. It is context for a single-clinic view: zone is a
   * reporting dimension and never decides what anyone may open.
   */
  zoneCode?: string | null;
  /**
   * The units the clinic types and reads screening values in. Optional for the same reason as
   * `zoneCode`: an older API build or an older cached bootstrap has none, and then values show in
   * the stored units, labelled as such, rather than in a guessed unit.
   */
  units?: Partial<ClinicUnits> | null;
  /** IANA zone the clinic keeps its days and times in. Optional for the same reason as `zoneCode`. */
  timezone?: string | null;
}

export interface BootstrapMembership extends BootstrapClinic {
  roles: string[];
}

export interface BootstrapClinicSource {
  activeClinicId?: string | null;
  availableClinics?: BootstrapClinic[];
  memberships?: BootstrapMembership[];
}

function uniqueClinics(clinics: BootstrapClinic[]): BootstrapClinic[] {
  const seen = new Set<string>();
  const deduped: BootstrapClinic[] = [];

  for (const clinic of clinics) {
    if (seen.has(clinic.clinicId)) {
      continue;
    }
    seen.add(clinic.clinicId);
    deduped.push(clinic);
  }

  return deduped;
}

export function getSwitchableClinics(
  bootstrap: BootstrapClinicSource | null | undefined,
): BootstrapClinic[] {
  const availableClinics = bootstrap?.availableClinics ?? [];
  if (availableClinics.length > 0) {
    return uniqueClinics(availableClinics);
  }

  return uniqueClinics(
    (bootstrap?.memberships ?? []).map((membership) => ({
      clinicId: membership.clinicId,
      clinicName: membership.clinicName,
      zoneCode: membership.zoneCode ?? null,
      ...(membership.units ? { units: membership.units } : {}),
      ...(membership.timezone ? { timezone: membership.timezone } : {}),
    })),
  );
}

export function getBootstrapActiveClinicId(
  bootstrap: BootstrapClinicSource | null | undefined,
): string | null {
  return bootstrap?.activeClinicId ?? getSwitchableClinics(bootstrap)[0]?.clinicId ?? null;
}

export function getActiveBootstrapClinic(
  bootstrap: BootstrapClinicSource | null | undefined,
  activeClinicId = getBootstrapActiveClinicId(bootstrap),
): BootstrapClinic | null {
  if (!activeClinicId) {
    return null;
  }

  return (
    getSwitchableClinics(bootstrap).find((clinic) => clinic.clinicId === activeClinicId) ?? null
  );
}

export function isStoredClinicIdValid(
  bootstrap: BootstrapClinicSource | null | undefined,
  clinicId: string | null | undefined,
): boolean {
  if (!clinicId) {
    return false;
  }

  return getSwitchableClinics(bootstrap).some((clinic) => clinic.clinicId === clinicId);
}

/** The units to enter and show values in at this clinic; the stored units when unknown. */
export function getClinicUnits(
  bootstrap: BootstrapClinicSource | null | undefined,
  clinicId: string | null | undefined,
): ClinicUnits {
  const clinic = clinicId
    ? getSwitchableClinics(bootstrap).find((candidate) => candidate.clinicId === clinicId)
    : null;
  return resolveClinicUnits(clinic?.units);
}

/** The zone `clinicId` keeps its days in; the default when unknown or not a real IANA zone. */
export function getClinicTimeZone(
  bootstrap: BootstrapClinicSource | null | undefined,
  clinicId: string | null | undefined,
): string {
  const zone = clinicId
    ? getSwitchableClinics(bootstrap).find((candidate) => candidate.clinicId === clinicId)?.timezone
    : null;
  if (!zone) return CLINIC_DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return CLINIC_DEFAULT_TIMEZONE;
  }
}
