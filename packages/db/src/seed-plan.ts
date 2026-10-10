/**
 * What `prisma/seed.ts` is about to do, decided before it opens a connection.
 *
 * The seed used to read its switches straight from `process.env` after `import 'dotenv/config'`,
 * and dotenv fills in every variable the shell did not set. Run from the repo root against
 * production, it picked up a developer's `.env` and wrote the E2E users (one of them a global
 * SYSTEM_ADMIN) and the demo patients into the live database (#200).
 *
 * This function is the only place those switches are read. It is pure -- no I/O, no dotenv -- so
 * the refusal rules can be unit tested, and the seed can exit before it constructs a client.
 */

export const SEED_ENVIRONMENTS = ['local', 'ci', 'staging', 'production'] as const;
export type SeedEnvironment = (typeof SEED_ENVIRONMENTS)[number];

/** Variables that only ever exist to create fixtures. Any of them in production is a mistake. */
const FIXTURE_VARIABLE_PATTERN = /^(SEED_SAMPLE_|SEED_E2E_|E2E_)/;

/** Fixture users are created under this domain, so they stay findable if the guard is bypassed. */
export const SEED_FIXTURE_EMAIL_DOMAIN = '@nkwapa.local';

/**
 * Every chart the seed creates as a fixture, by (firstName, lastName).
 *
 * The names are the marker: nobody registers a real patient as "E2E Portal". Shared with the
 * purge script and the post-deploy fixture check (#201), so the three cannot disagree. The
 * duplicate and cross-clinic fixtures (Akua Boateng, Yaw Darko, ...) are left out on purpose:
 * they use realistic names, and a real patient could carry one.
 */
export const SEED_FIXTURE_PATIENT_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['Demo', 'Patient'],
  ['Appointment', 'Demo'],
  ['E2E', 'Portal'],
  ['E2E', 'Unclaimed'],
  ['E2E', 'Lifecycle'],
  ['E2E', 'InviteHistory'],
  ['E2E', 'Signup'],
  ['E2E', 'Merged'],
  ['E2E', 'Retired'],
  ['E2E', 'Collision'],
  ['E2E', 'No Birthday'],
  ['E2E', 'By Phone'],
  ['E2E', 'Claimable'],
  ['E2E Keep', 'Blocked'],
  ['E2E Duplicate', 'Blocked'],
];

export interface SeedIdentity {
  sub: string;
  name: string;
  email: string;
}

export interface SeedPlan {
  environment: SeedEnvironment;
  target: { host: string; database: string };
  organization: { name?: string; slug?: string; timezone?: string };
  clinic: {
    name?: string;
    region?: string;
    country?: string;
    timezone?: string;
    locationCode?: string;
    zoneCode?: string;
  };
  drugCatalog: boolean;
  systemAdmin: { sub: string; name: string } | null;
  sample: {
    patient: boolean;
    appointments: boolean;
    duplicates: boolean;
    crossClinic: boolean;
    identity: boolean;
  };
  e2e: {
    staff: SeedIdentity | null;
    doctor: SeedIdentity | null;
    volunteer: SeedIdentity | null;
    patient: SeedIdentity | null;
    /** The claimant user is only created when `sub` is set; the email is used regardless. */
    claimant: { sub?: string; name: string; email: string };
    claimEmail: string;
  };
}

export type SeedPlanResult = { ok: true; plan: SeedPlan } | { ok: false; errors: string[] };

type Env = Record<string, string | undefined>;

function isSeedEnvironment(value: string | undefined): value is SeedEnvironment {
  return (SEED_ENVIRONMENTS as readonly string[]).includes(value ?? '');
}

function identity(
  env: Env,
  role: 'STAFF' | 'DOCTOR' | 'VOLUNTEER' | 'PATIENT',
  defaultName: string,
): SeedIdentity | null {
  const sub = (env[`SEED_E2E_${role}_SUB`] ?? env[`E2E_${role}_SUB`])?.trim();
  if (!sub) return null;
  return {
    sub,
    name: env[`SEED_E2E_${role}_NAME`] ?? defaultName,
    email: env[`SEED_E2E_${role}_EMAIL`] ?? `e2e.${role.toLowerCase()}${SEED_FIXTURE_EMAIL_DOMAIN}`,
  };
}

function parseTarget(databaseUrl: string | undefined): SeedPlan['target'] | null {
  if (!databaseUrl) return null;
  try {
    const url = new URL(databaseUrl);
    return { host: url.hostname, database: decodeURIComponent(url.pathname.replace(/^\//, '')) };
  } catch {
    return null;
  }
}

export function planSeed(env: Env): SeedPlanResult {
  const environment = env.SEED_ENVIRONMENT;
  if (!isSeedEnvironment(environment)) {
    return {
      ok: false,
      errors: [
        `SEED_ENVIRONMENT must be one of ${SEED_ENVIRONMENTS.join(', ')}` +
          (environment ? ` (got "${environment}").` : '. It is not set.') +
          ' Locally, use npm run db:seed:local.',
      ],
    };
  }

  const errors: string[] = [];
  const target = parseTarget(env.DATABASE_URL);
  if (!target) errors.push('DATABASE_URL is missing or is not a valid URL.');

  const deployed = environment === 'staging' || environment === 'production';

  if (environment === 'production') {
    const fixtureVariables = Object.keys(env)
      .filter((key) => FIXTURE_VARIABLE_PATTERN.test(key) && env[key] !== undefined)
      .sort();
    if (fixtureVariables.length > 0) {
      errors.push(
        `Refusing to seed production with fixture variables set: ${fixtureVariables.join(', ')}. ` +
          'Unset them in this shell.',
      );
    }
  }

  if (target) {
    const isLocalHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.host);
    if (environment === 'production' && isLocalHost) {
      errors.push(`SEED_ENVIRONMENT=production but DATABASE_URL points at ${target.host}.`);
    }
    if ((environment === 'local' || environment === 'ci') && target.host.endsWith('neon.tech')) {
      errors.push(
        `SEED_ENVIRONMENT=${environment} but DATABASE_URL points at ${target.host}, a hosted database.`,
      );
    }
    if (deployed && env.SEED_CONFIRM !== target.database) {
      errors.push(
        `Set SEED_CONFIRM=${target.database} to confirm seeding the ${environment} database "${target.database}" on ${target.host}.`,
      );
    }
  }

  // The fallback name is "Nkwapa Clinic - Demo". A deployed clinic must be named on purpose.
  if (deployed && !env.SEED_CLINIC_NAME) {
    errors.push(`SEED_CLINIC_NAME is required for ${environment}.`);
  }

  if (errors.length > 0 || !target) return { ok: false, errors };

  const flag = (key: string) => env[key] === 'true';
  const sysAdminSub = env.SEED_SYSTEM_ADMIN_SUB?.trim();

  return {
    ok: true,
    plan: {
      environment,
      target,
      organization: {
        name: env.SEED_ORGANIZATION_NAME,
        slug: env.SEED_ORGANIZATION_SLUG,
        timezone: env.SEED_ORGANIZATION_TIMEZONE,
      },
      clinic: {
        name: env.SEED_CLINIC_NAME,
        region: env.SEED_CLINIC_REGION,
        country: env.SEED_CLINIC_COUNTRY,
        timezone: env.SEED_CLINIC_TIMEZONE,
        locationCode: env.SEED_CLINIC_LOCATION_CODE,
        zoneCode: env.SEED_CLINIC_ZONE_CODE,
      },
      // A demo catalogue in production would be prescribed from; it has to be asked for.
      drugCatalog: environment === 'production' ? flag('SEED_DRUG_CATALOG') : true,
      systemAdmin: sysAdminSub
        ? { sub: sysAdminSub, name: env.SEED_SYSTEM_ADMIN_NAME ?? 'System Admin' }
        : null,
      sample: {
        patient: flag('SEED_SAMPLE_PATIENT'),
        appointments: flag('SEED_SAMPLE_APPOINTMENTS'),
        duplicates: flag('SEED_SAMPLE_DUPLICATES'),
        crossClinic: flag('SEED_SAMPLE_CROSS_CLINIC'),
        identity: flag('SEED_SAMPLE_IDENTITY'),
      },
      e2e: {
        staff: identity(env, 'STAFF', 'E2E Staff'),
        doctor: identity(env, 'DOCTOR', 'E2E Doctor'),
        volunteer: identity(env, 'VOLUNTEER', 'E2E Volunteer'),
        patient: identity(env, 'PATIENT', 'E2E Patient'),
        claimant: {
          sub: (env.SEED_E2E_CLAIMANT_SUB ?? env.E2E_CLAIMANT_SUB)?.trim() || undefined,
          name: env.SEED_E2E_CLAIMANT_NAME ?? 'E2E Claimant',
          email:
            env.SEED_E2E_CLAIMANT_EMAIL ??
            env.E2E_CLAIMANT_EMAIL ??
            `e2e.claimant${SEED_FIXTURE_EMAIL_DOMAIN}`,
        },
        claimEmail: env.SEED_E2E_CLAIM_EMAIL ?? `e2e.claim${SEED_FIXTURE_EMAIL_DOMAIN}`,
      },
    },
  };
}

/** The pre-flight summary the seed prints before it writes anything. */
export function describeSeedPlan(plan: SeedPlan): string[] {
  const sample = Object.entries(plan.sample)
    .filter(([, on]) => on)
    .map(([name]) => name);
  const e2e: string[] = (['staff', 'doctor', 'volunteer', 'patient'] as const).filter(
    (role) => plan.e2e[role] !== null,
  );
  if (plan.e2e.claimant.sub) e2e.push('claimant');
  return [
    `Seed environment: ${plan.environment}`,
    `Target:           ${plan.target.host} / ${plan.target.database}`,
    `Organization:     ${plan.organization.slug ?? '(default)'}`,
    `Clinic:           ${plan.clinic.name ?? '(default demo name)'}`,
    `System admin:     ${plan.systemAdmin ? plan.systemAdmin.name : 'none'}`,
    `Drug catalogue:   ${plan.drugCatalog ? 'yes' : 'no'}`,
    `Sample data:      ${sample.length > 0 ? sample.join(', ') : 'none'}`,
    `E2E identities:   ${e2e.length > 0 ? e2e.join(', ') : 'none'}`,
  ];
}
