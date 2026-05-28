export interface BootstrapClinic {
  clinicId: string;
  clinicName: string;
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
