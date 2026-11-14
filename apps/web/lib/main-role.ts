/**
 * The one role a person's dashboard is built around in the active clinic (Phase W2). Precedence is
 * by responsibility; the other roles they hold become "Also on your plate" rows, not sections.
 */
export const MAIN_ROLE_PRECEDENCE = [
  'SYSTEM_ADMIN',
  'DIRECTOR',
  'MANAGER',
  'DOCTOR',
  'VOLUNTEER',
] as const;

export type MainRole = (typeof MAIN_ROLE_PRECEDENCE)[number];

/** Which dashboard data keys came back, for when the bootstrap carries no roles. */
interface DashboardKeys {
  systemAdmin?: unknown;
  director?: unknown;
  doctor?: unknown;
  review?: unknown;
  volunteer?: unknown;
}

export function pickMainRole(
  roles: readonly string[],
  data?: DashboardKeys | null,
): MainRole | null {
  const held = MAIN_ROLE_PRECEDENCE.find((role) => roles.includes(role));
  if (held) return held;
  // The API sends `director` to managers too; without roles the higher responsibility is assumed.
  if (data?.systemAdmin) return 'SYSTEM_ADMIN';
  if (data?.director) return 'DIRECTOR';
  if (data?.doctor || data?.review) return 'DOCTOR';
  if (data?.volunteer) return 'VOLUNTEER';
  return null;
}
