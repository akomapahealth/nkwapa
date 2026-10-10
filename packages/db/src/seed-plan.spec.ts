import { describeSeedPlan, planSeed, type SeedPlan } from './seed-plan';

// No password in either URL: the secret scanner rejects any credentialed non-local connection string.
const PROD_URL = 'postgresql://owner@ep-quiet-sky-123.eu-central-1.aws.neon.tech/nkwapa';
const LOCAL_URL = 'postgresql://nkwapa@localhost:5432/nkwapa';

/** The shape of a developer's `.env` on 2026-10-10, the one that leaked into production (#200). */
const LOCAL_DOTENV = {
  SEED_SAMPLE_PATIENT: 'true',
  SEED_SAMPLE_APPOINTMENTS: 'true',
  E2E_STAFF_SUB: 'local-staff-sub',
  E2E_DOCTOR_SUB: 'local-doctor-sub',
  E2E_VOLUNTEER_SUB: 'local-volunteer-sub',
  E2E_PATIENT_SUB: 'local-patient-sub',
  E2E_CLAIMANT_SUB: 'local-claimant-sub',
  E2E_CLAIMANT_EMAIL: 'e2e.claimant@nkwapa.local',
  NATIONAL_ID_ENCRYPTION_KEY: 'local-key',
};

const PRODUCTION = {
  SEED_ENVIRONMENT: 'production',
  DATABASE_URL: PROD_URL,
  SEED_CONFIRM: 'nkwapa',
  SEED_CLINIC_NAME: 'Akomapa Clinic',
  SEED_SYSTEM_ADMIN_SUB: 'prod-admin-sub',
};

function expectPlan(env: Record<string, string>): SeedPlan {
  const result = planSeed(env);
  if (!result.ok) throw new Error(`expected a plan, got: ${result.errors.join(' | ')}`);
  return result.plan;
}

function expectErrors(env: Record<string, string>): string {
  const result = planSeed(env);
  if (result.ok) throw new Error('expected the seed to be refused');
  return result.errors.join('\n');
}

describe('planSeed', () => {
  it('refuses to run without SEED_ENVIRONMENT', () => {
    expect(expectErrors({ DATABASE_URL: LOCAL_URL })).toMatch(/SEED_ENVIRONMENT must be one of/);
  });

  it('refuses an unknown SEED_ENVIRONMENT', () => {
    expect(expectErrors({ SEED_ENVIRONMENT: 'prod', DATABASE_URL: PROD_URL })).toMatch(/"prod"/);
  });

  it('names the fixture variable that blocks a production seed', () => {
    const errors = expectErrors({ ...PRODUCTION, SEED_SAMPLE_PATIENT: 'true' });
    expect(errors).toMatch(/fixture variables set: SEED_SAMPLE_PATIENT\./);
  });

  it('refuses production when a local .env has leaked into the environment', () => {
    const errors = expectErrors({ ...LOCAL_DOTENV, ...PRODUCTION });
    for (const name of [
      'SEED_SAMPLE_PATIENT',
      'SEED_SAMPLE_APPOINTMENTS',
      'E2E_STAFF_SUB',
      'E2E_CLAIMANT_SUB',
    ]) {
      expect(errors).toContain(name);
    }
  });

  it('counts a fixture variable that is set but empty', () => {
    expect(expectErrors({ ...PRODUCTION, SEED_E2E_STAFF_SUB: '' })).toContain('SEED_E2E_STAFF_SUB');
  });

  it('plans only the organization, clinic and system admin for a clean production run', () => {
    const plan = expectPlan(PRODUCTION);
    expect(plan.systemAdmin).toEqual({ sub: 'prod-admin-sub', name: 'System Admin' });
    expect(plan.clinic.name).toBe('Akomapa Clinic');
    expect(plan.drugCatalog).toBe(false);
    expect(Object.values(plan.sample).some(Boolean)).toBe(false);
    expect(plan.e2e.staff).toBeNull();
    expect(plan.e2e.doctor).toBeNull();
    expect(plan.e2e.volunteer).toBeNull();
    expect(plan.e2e.patient).toBeNull();
    expect(plan.e2e.claimant.sub).toBeUndefined();
  });

  it('seeds the drug catalogue in production only when asked to', () => {
    expect(expectPlan({ ...PRODUCTION, SEED_DRUG_CATALOG: 'true' }).drugCatalog).toBe(true);
  });

  it('requires SEED_CONFIRM to name the target database for staging and production', () => {
    const { SEED_CONFIRM: _omit, ...unconfirmed } = PRODUCTION;
    expect(expectErrors(unconfirmed)).toMatch(/Set SEED_CONFIRM=nkwapa/);
    expect(expectErrors({ ...PRODUCTION, SEED_CONFIRM: 'nkwapa_dev' })).toMatch(
      /Set SEED_CONFIRM=nkwapa/,
    );
    expect(
      expectErrors({ ...PRODUCTION, SEED_ENVIRONMENT: 'staging', SEED_CONFIRM: 'wrong' }),
    ).toMatch(/staging database "nkwapa"/);
  });

  it('requires a clinic name for a deployed environment', () => {
    const { SEED_CLINIC_NAME: _omit, ...unnamed } = PRODUCTION;
    expect(expectErrors(unnamed)).toMatch(/SEED_CLINIC_NAME is required for production/);
  });

  it('refuses production pointed at localhost', () => {
    expect(expectErrors({ ...PRODUCTION, DATABASE_URL: LOCAL_URL })).toMatch(
      /production but DATABASE_URL points at localhost/,
    );
  });

  it.each(['local', 'ci'])('refuses %s pointed at a hosted Neon database', (environment) => {
    expect(expectErrors({ SEED_ENVIRONMENT: environment, DATABASE_URL: PROD_URL })).toMatch(
      /neon\.tech, a hosted database/,
    );
  });

  it('refuses a missing DATABASE_URL', () => {
    expect(expectErrors({ SEED_ENVIRONMENT: 'local' })).toMatch(/DATABASE_URL is missing/);
  });

  it('plans every fixture CI asks for', () => {
    const plan = expectPlan({
      SEED_ENVIRONMENT: 'ci',
      DATABASE_URL: LOCAL_URL,
      SEED_SAMPLE_APPOINTMENTS: 'true',
      SEED_SAMPLE_DUPLICATES: 'true',
      SEED_SAMPLE_CROSS_CLINIC: 'true',
      SEED_SAMPLE_IDENTITY: 'true',
      E2E_STAFF_SUB: 'ci-staff',
      E2E_DOCTOR_SUB: 'ci-doctor',
      E2E_VOLUNTEER_SUB: 'ci-volunteer',
      E2E_PATIENT_SUB: 'ci-patient',
      E2E_CLAIMANT_SUB: 'ci-claimant',
      SEED_E2E_STAFF_NAME: 'E2E Staff',
    });
    expect(plan.sample).toEqual({
      patient: false,
      appointments: true,
      duplicates: true,
      crossClinic: true,
      identity: true,
    });
    expect(plan.e2e.staff).toEqual({
      sub: 'ci-staff',
      name: 'E2E Staff',
      email: 'e2e.staff@nkwapa.local',
    });
    expect(plan.e2e.claimant.sub).toBe('ci-claimant');
    expect(plan.drugCatalog).toBe(true);
  });

  it('prefers SEED_E2E_* over E2E_* for an identity', () => {
    const plan = expectPlan({
      SEED_ENVIRONMENT: 'local',
      DATABASE_URL: LOCAL_URL,
      E2E_DOCTOR_SUB: 'fallback',
      SEED_E2E_DOCTOR_SUB: ' explicit ',
    });
    expect(plan.e2e.doctor?.sub).toBe('explicit');
  });
});

describe('describeSeedPlan', () => {
  it('shows the target and that nothing but the bootstrap will be written', () => {
    const lines = describeSeedPlan(expectPlan(PRODUCTION)).join('\n');
    expect(lines).toContain('ep-quiet-sky-123.eu-central-1.aws.neon.tech / nkwapa');
    expect(lines).toMatch(/Sample data: +none/);
    expect(lines).toMatch(/E2E identities: +none/);
    expect(lines).not.toContain('owner');
  });
});
