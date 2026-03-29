export const OPS_DEFAULT_TIMEZONE = "Africa/Accra";

export const SHIFT_ROLES = [
  "VOLUNTEER",
  "DOCTOR",
  "PRECEPTOR",
  "MANAGER",
] as const;

export const CHECKIN_STATUS_ORDER = [
  "WAITING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ShiftRole = (typeof SHIFT_ROLES)[number];
export type CheckInStatus = (typeof CHECKIN_STATUS_ORDER)[number];
export type AssignmentStatus = "ACTIVE" | "REASSIGNED" | "CANCELLED";

export interface ActiveShift {
  shiftId: string;
  userId: string;
  displayName: string;
  roleAtShift: ShiftRole;
  checkedInAt: string;
  status: "ACTIVE" | "CLOSED";
}

export interface ActiveShiftsResponse {
  date: string;
  timezone: string;
  items: ActiveShift[];
}

export interface AssignmentParty {
  id: string;
  displayName: string;
}

export interface CheckInAssignmentSummary {
  id: string;
  assignedAt: string;
  status: AssignmentStatus;
  assignedVolunteer: AssignmentParty;
  assignedDoctor: AssignmentParty;
  assignedBy: AssignmentParty;
}

export interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export interface CheckInSummary {
  id: string;
  clinicId: string;
  patientId: string;
  checkedInAt: string;
  source: string;
  status: CheckInStatus;
  encounterId: string | null;
  notes: string | null;
  patient: PatientSummary;
  assignmentSummary: CheckInAssignmentSummary | null;
}

export interface CheckInsResponse {
  date: string;
  timezone: string;
  items: CheckInSummary[];
}

export interface AssignmentSummary {
  id: string;
  clinicId: string;
  patientCheckInId: string;
  assignedAt: string;
  status: AssignmentStatus;
  reason: string | null;
  assignedVolunteer: AssignmentParty;
  assignedDoctor: AssignmentParty;
  assignedBy: AssignmentParty;
  patientCheckIn: {
    id: string;
    checkedInAt: string;
    status: CheckInStatus;
    encounterId: string | null;
  };
  patient: PatientSummary;
}

export interface MyAssignmentSummary {
  id: string;
  patientCheckInId: string;
  assignedRole: "VOLUNTEER" | "DOCTOR";
  assignedAt: string;
  checkInStatus: CheckInStatus;
  checkedInAt: string;
  encounterId: string | null;
  patient: PatientSummary;
  assignedVolunteer: AssignmentParty;
  assignedDoctor: AssignmentParty;
}

export interface MyAssignmentsResponse {
  date: string;
  timezone: string;
  items: MyAssignmentSummary[];
}

export interface ShiftDetail {
  id: string;
  clinicId: string;
  userId: string;
  displayName: string;
  roleAtShift: ShiftRole;
  checkedInAt: string;
  checkedOutAt: string | null;
  status: "ACTIVE" | "CLOSED";
  notes: string | null;
}

function formatInTimeZone(
  value: string | number | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...options,
  }).format(new Date(value));
}

export function getTodayInTimeZone(timeZone = OPS_DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<"year" | "month" | "day", string>;

  return `${values.year}-${values.month}-${values.day}`;
}

export function formatOpsDate(date: string, timeZone = OPS_DEFAULT_TIMEZONE) {
  return formatInTimeZone(`${date}T12:00:00.000Z`, timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatOpsDateTime(
  value: string,
  timeZone = OPS_DEFAULT_TIMEZONE
) {
  return formatInTimeZone(value, timeZone, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatOpsTime(value: string, timeZone = OPS_DEFAULT_TIMEZONE) {
  return formatInTimeZone(value, timeZone, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRoleLabel(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatStatusLabel(status: string) {
  return formatRoleLabel(status);
}

export function getEligibleShiftRoles(roles: string[]) {
  return roles.filter((role): role is ShiftRole =>
    SHIFT_ROLES.includes(role as ShiftRole)
  );
}

export function hasPermission(permissions: string[], permission: string) {
  return permissions.includes("*") || permissions.includes(permission);
}

export function hasAnyPermission(permissions: string[], candidates: string[]) {
  return permissions.includes("*") || candidates.some((perm) => permissions.includes(perm));
}

export function getOpsDestination(permissions: string[]) {
  if (
    hasAnyPermission(permissions, [
      "OPS.ASSIGNMENT.MANAGE",
      "OPS.CHECKIN.READ",
    ])
  ) {
    return "/today";
  }

  if (hasPermission(permissions, "OPS.ASSIGNMENT.READ_SELF")) {
    return "/my/assigned";
  }

  return null;
}

export async function readApiError(response: Response) {
  const raw = await response.text();

  if (!raw) {
    return `Request failed with status ${response.status}`;
  }

  try {
    const parsed = JSON.parse(raw) as
      | { message?: string | string[] }
      | string;

    if (typeof parsed === "string") {
      return parsed;
    }

    if (Array.isArray(parsed.message)) {
      return parsed.message.join(", ");
    }

    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    return raw;
  }

  return raw;
}
