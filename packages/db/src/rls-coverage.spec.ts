import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
const migrationsRoot = resolve(__dirname, '../prisma/migrations');
const migrationSql = readdirSync(migrationsRoot)
  .filter((name) => /^\d/.test(name))
  .sort()
  .map((name) => readFileSync(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'))
  .join('\n');

/**
 * Models deliberately left outside row level security, with the reason.
 *
 * The tenant context is derived from these tables, so a policy on them would have to consult a
 * context that does not exist yet. They carry no clinical data.
 */
const BOOTSTRAP_MODELS: Record<string, string> = {
  UserClinicRole:
    'The role grants the tenant context is built from; read during authentication before any context exists.',
};

/** Models whose rows describe one clinic's or one patient's data. */
function tenantScopedModels(): string[] {
  const models: string[] = [];
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match;
    if (name in BOOTSTRAP_MODELS) continue;
    if (/^\s+(clinicId|primaryClinicId|patientId)\s/m.test(body)) models.push(name);
  }
  return models;
}

describe('row level security coverage', () => {
  const models = tenantScopedModels();

  it('documents why a bootstrap model is exempt', () => {
    for (const [model, reason] of Object.entries(BOOTSTRAP_MODELS)) {
      expect(schema).toContain(`model ${model} {`);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('finds the tenant-scoped models to check', () => {
    expect(models.length).toBeGreaterThan(20);
    expect(models).toContain('Patient');
    expect(models).toContain('ClinicalNote');
    expect(models).toContain('MedicalHistoryRecord');
  });

  it.each(models)('enables row level security on %s', (model) => {
    expect(migrationSql).toContain(`ALTER TABLE "${model}" ENABLE ROW LEVEL SECURITY`);
  });

  it.each(models)('forces row level security on %s', (model) => {
    // Enabling is not enforcing. PostgreSQL exempts a table's owner from its own policies unless
    // the table is FORCEd, and the application connects as the owner, so an unforced table has no
    // protection at all.
    expect(migrationSql).toContain(`ALTER TABLE "${model}" FORCE ROW LEVEL SECURITY`);
  });

  it.each(models)('declares at least one policy on %s', (model) => {
    expect(migrationSql).toMatch(new RegExp(`CREATE POLICY "[^"]+" ON "${model}"`));
  });

  it('provisions an application role that cannot bypass the policies', () => {
    expect(migrationSql).toContain('NOBYPASSRLS');
    expect(migrationSql).toMatch(/CREATE ROLE nkwapa_app[^;]*NOSUPERUSER/);
  });
});

/**
 * Zone is a reporting dimension, not a permission scope.
 *
 * The V1 policy is stated in `docs/specs/03_AUTH_AND_RBAC.md`: a zone filter may only narrow a
 * set of clinics an actor is already authorized to see, and sharing a zone with a clinic never
 * grants access to it. The API enforces that by resolving the actor's clinics before any zone
 * clause is applied, but a service-layer habit is one refactor from not being a boundary.
 *
 * These are the database half of the guarantee. `app.current_zone_code()` exists and the RLS
 * context sets it, which makes it available for diagnostics and for a future deliberate change
 * -- and makes it exactly the sort of thing someone reaches for while adding "just one" zone
 * predicate. If that happens, this fails and points at the docs that would need rewriting first.
 */
describe('zone is not a permission scope', () => {
  const policies = [...migrationSql.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((match) => match[0]);

  it('finds the policies to check', () => {
    expect(policies.length).toBeGreaterThan(20);
  });

  it('defines the zone context helper', () => {
    // Its presence is the point: the setting is carried deliberately, not by accident.
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.current_zone_code()');
  });

  it('never reads the zone context from a policy', () => {
    const offenders = policies.filter((policy) => policy.includes('current_zone_code'));
    expect(offenders).toEqual([]);
  });

  it('never reads a clinic zone column from a policy', () => {
    const offenders = policies.filter((policy) => /"?zoneCode"?/.test(policy));
    expect(offenders).toEqual([]);
  });

  it('keeps zone off the table that grants roles', () => {
    // A zone column on UserClinicRole is what a zone-scoped role would need. Its absence is the
    // schema-level statement that no such role exists.
    const userClinicRole = schema.match(/^model UserClinicRole \{([\s\S]*?)^\}/m);
    expect(userClinicRole).not.toBeNull();
    expect(userClinicRole?.[1]).not.toMatch(/zone/i);
  });

  it('decides clinic access from the clinic id list alone', () => {
    // The one predicate every clinic-scoped policy funnels through. If zone ever widens access,
    // it widens here first.
    const canAccessClinic = migrationSql.match(
      /CREATE OR REPLACE FUNCTION app\.can_access_clinic[\s\S]*?\$\$;/,
    );
    expect(canAccessClinic).not.toBeNull();
    expect(canAccessClinic?.[0]).toContain('app.current_clinic_ids()');
    expect(canAccessClinic?.[0]).not.toContain('zone');
  });
});
