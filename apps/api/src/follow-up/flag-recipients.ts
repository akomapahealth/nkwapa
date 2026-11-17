import type { Prisma, ShiftRole, UserRole } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/constants/permissions';

/** Every follow-up event that tells someone (#337). Moving down or becoming Stable tells nobody. */
export type FlagEvent =
  /** Danger signs: the patient became Urgent, or screening found an urgent sign. */
  | 'URGENT'
  /** The patient moved up to High. */
  | 'HIGH'
  /** Very high blood pressure without danger symptoms, confirmed on repeat. */
  | 'SEVERE_BP'
  /** Still High months after becoming High: a clinician should review the plan. */
  | 'NOT_IMPROVING'
  /** Nobody took an urgent flag in time. */
  | 'UNACKNOWLEDGED'
  /** The directors' daily counts. */
  | 'DIGEST';

/** Who works at the clinic, read once per event. Directors include organisation-wide ones. */
export interface ClinicStaff {
  onShift: ReadonlyArray<{ userId: string; role: ShiftRole }>;
  roles: ReadonlyArray<{ userId: string; role: UserRole }>;
}

const MANAGE_ROLES = new Set(
  (Object.entries(ROLE_PERMISSIONS) as Array<[UserRole, readonly string[]]>)
    .filter(
      ([role, perms]) => role !== 'SYSTEM_ADMIN' && perms.includes(PERMISSIONS.FOLLOW_UP_MANAGE),
    )
    .map(([role]) => role),
);

/**
 * Who is told about a follow-up event, never the person whose save caused it: they are looking
 * at the warning already. The table in #337, as code.
 */
export function flagRecipients(
  event: FlagEvent,
  staff: ClinicStaff,
  actorUserId?: string | null,
): string[] {
  const withRole = (...roles: UserRole[]) =>
    staff.roles.filter((r) => roles.includes(r.role)).map((r) => r.userId);
  const onShiftAs = (...roles: ShiftRole[]) =>
    staff.onShift.filter((s) => roles.includes(s.role)).map((s) => s.userId);

  let ids: string[];
  switch (event) {
    case 'URGENT': {
      const clinical = onShiftAs('DOCTOR', 'VOLUNTEER');
      ids = clinical.length ? [...clinical, ...withRole('MANAGER')] : withRole('DOCTOR', 'MANAGER');
      break;
    }
    case 'HIGH':
    case 'SEVERE_BP':
      ids = [
        ...staff.roles.filter((r) => MANAGE_ROLES.has(r.role)).map((r) => r.userId),
        ...onShiftAs('DOCTOR'),
      ];
      break;
    case 'NOT_IMPROVING':
      ids = withRole('DOCTOR');
      break;
    case 'UNACKNOWLEDGED':
      ids = withRole('MANAGER', 'DIRECTOR');
      break;
    case 'DIGEST':
      ids = withRole('DIRECTOR');
      break;
  }
  return [...new Set(ids)].filter((id) => id !== actorUserId);
}

/**
 * The clinic's staff as `flagRecipients` needs them. Runs detached from any request, so it scopes
 * by clinic by hand, and leaves out deactivated accounts.
 */
export async function loadClinicStaff(
  client: Prisma.TransactionClient,
  clinicId: string,
): Promise<ClinicStaff> {
  const active = { isActive: true };
  const [onShift, roles] = await Promise.all([
    client.staffShift.findMany({
      where: { clinicId, status: 'ACTIVE', user: active },
      select: { userId: true, roleAtShift: true },
    }),
    client.userClinicRole.findMany({
      where: {
        user: active,
        OR: [{ clinicId }, { clinicId: null, role: 'DIRECTOR' }],
      },
      select: { userId: true, role: true },
    }),
  ]);
  return {
    onShift: onShift.map((s) => ({ userId: s.userId, role: s.roleAtShift })),
    roles,
  };
}
