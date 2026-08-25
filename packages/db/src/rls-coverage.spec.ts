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
