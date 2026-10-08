/**
 * Staff workload at a clinic (#33), as the web reads it. Aggregates of the audit trail, read
 * under AUDIT.READ; no patient appears in any of it.
 */

export interface StaffActivityCategoryInfo {
  key: string;
  label: string;
}

export interface StaffActivityRow {
  userId: string;
  displayName: string;
  active: boolean;
  roles: string[];
  shifts: number;
  shiftHours: number;
  counts: Record<string, number>;
  total: number;
}

export interface StaffActivityOverview {
  from: string;
  to: string;
  timezone: string;
  categories: StaffActivityCategoryInfo[];
  staff: StaffActivityRow[];
  totals: Record<string, number>;
}

export interface StaffActivityPerson {
  from: string;
  to: string;
  timezone: string;
  categories: StaffActivityCategoryInfo[];
  person: { userId: string; displayName: string; active: boolean; roles: string[] } | null;
  days: Array<{ day: string; counts: Record<string, number> }>;
  records: Array<{
    action: string;
    category: string;
    entityType: string;
    at: string;
    href: string | null;
  }>;
}

export const staffActivityPath = (
  clinicId: string,
  range: { from: string; to: string },
  userId?: string,
) =>
  `/clinics/${encodeURIComponent(clinicId)}/staff-activity${
    userId ? `/${encodeURIComponent(userId)}` : ''
  }?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

const ROLE_LABELS: Record<string, string> = {
  DIRECTOR: 'Director',
  MANAGER: 'Manager',
  DOCTOR: 'Doctor',
  VOLUNTEER: 'Volunteer',
};

export function formatRoles(roles: readonly string[]): string {
  return roles.length ? roles.map((role) => ROLE_LABELS[role] ?? role).join(', ') : 'No seat here';
}

/** "Visit" for an encounter, "Station visit" for a station stop, otherwise the type itself. */
export function describeRecord(entityType: string): string {
  if (entityType === 'Encounter') return 'Visit';
  if (entityType === 'PatientStationVisit') return 'Station visit';
  return entityType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** The last seven days ending on `today`, the default range. */
export function lastSevenDays(today: string): { from: string; to: string } {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { from, to: today };
}
