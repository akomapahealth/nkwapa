import { Logger } from '@nestjs/common';

/**
 * Whether the database can actually enforce the row-level-security policies it declares.
 *
 * Declaring a policy is not the same as it applying. PostgreSQL exempts a superuser, any role
 * holding BYPASSRLS, and — unless the table is FORCEd — the table's own owner. Miss any of those
 * and every policy in the schema is inert while still reading as protection in the migration
 * files, which is the most dangerous shape a security control can take.
 *
 * This check runs at boot so a misconfigured connection is reported by the service that would
 * otherwise be silently unprotected, rather than depending on a migration having succeeded.
 */
export interface RlsEnforcementStatus {
  role: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
  unforcedTables: string[];
  enforced: boolean;
}

export interface RlsEnforcementProbe {
  role: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
  unforcedTables: string[];
}

export function evaluateRlsEnforcement(probe: RlsEnforcementProbe): RlsEnforcementStatus {
  return {
    ...probe,
    enforced: !probe.isSuperuser && !probe.bypassesRls && probe.unforcedTables.length === 0,
  };
}

export function describeRlsEnforcement(status: RlsEnforcementStatus): string {
  const reasons: string[] = [];
  if (status.isSuperuser) reasons.push(`role "${status.role}" is a superuser`);
  if (status.bypassesRls) reasons.push(`role "${status.role}" holds BYPASSRLS`);
  if (status.unforcedTables.length > 0) {
    const listed = status.unforcedTables.slice(0, 5).join(', ');
    const rest = status.unforcedTables.length - Math.min(5, status.unforcedTables.length);
    reasons.push(
      `row level security is not forced on ${status.unforcedTables.length} table(s): ${listed}${rest > 0 ? `, and ${rest} more` : ''}`,
    );
  }
  return `Row level security is NOT being enforced: ${reasons.join('; ')}. Clinic and organization isolation currently depends on application code alone. Connect as a non-superuser role without BYPASSRLS and apply the FORCE ROW LEVEL SECURITY migration.`;
}

/** `required` turns a non-enforcing database into a startup failure instead of a warning. */
export function rlsEnforcementMode(env: NodeJS.ProcessEnv): 'required' | 'warn' {
  return env.DATABASE_RLS_ENFORCEMENT === 'required' ? 'required' : 'warn';
}

export class RlsNotEnforcedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RlsNotEnforcedError';
  }
}

export function reportRlsEnforcement(
  status: RlsEnforcementStatus,
  mode: 'required' | 'warn',
  logger: Pick<Logger, 'log' | 'error' | 'warn'>,
): void {
  if (status.enforced) {
    logger.log(`Row level security is enforced for database role "${status.role}".`);
    return;
  }

  const message = describeRlsEnforcement(status);
  if (mode === 'required') {
    throw new RlsNotEnforcedError(message);
  }
  logger.error(message);
}

/**
 * The connection string the API should run on.
 *
 * Migrations run as the role that owns the tables; that role is exempt from row level security and
 * must not be what serves requests. `APP_DATABASE_URL` names the unprivileged runtime role, and
 * falls back to `DATABASE_URL` so an environment that has not been split yet still starts — the
 * boot check then reports that its policies are not being enforced.
 */
export function resolveApplicationDatabaseUrl(env: NodeJS.ProcessEnv): string {
  return env.APP_DATABASE_URL?.trim() || env.DATABASE_URL || '';
}
