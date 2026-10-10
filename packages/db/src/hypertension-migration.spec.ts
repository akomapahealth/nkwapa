import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Static assertions about the migration SQL.
 *
 * The integration counterpart replays it against PostgreSQL and checks the data; this checks the
 * decisions, which is the half that survives a rewrite. Mirrors `diabetes-migration.spec.ts`.
 */
const sql = readFileSync(
  resolve(
    __dirname,
    '../prisma/migrations/20260913090000_expand_hypertension_assessment/migration.sql',
  ),
  'utf8',
);

describe('expand_hypertension_assessment migration', () => {
  /*
    The dashboard groups by these, the research transform reads them, the patient chart renders
    them, and two Playwright specs assert on them. Extending the record must not disturb any of it.
  */
  it('keeps the columns that predate the interview', () => {
    expect(sql).not.toMatch(/DROP COLUMN "classification"/);
    expect(sql).not.toMatch(/DROP COLUMN "suspected"/);
    expect(sql).not.toMatch(/DROP COLUMN "confirmed"/);
    expect(sql).not.toMatch(/DROP TABLE "HypertensionAssessment"/);
    expect(sql).not.toMatch(/ALTER TABLE "HypertensionAssessment" RENAME/);
  });

  /*
    Every pre-existing row becomes an override.

    From this release the server derives a classification from the encounter's vitals on every
    write. Without the flag, the first save of an old encounter would replace a classification a
    clinician chose by hand with one a threshold computed, silently.
  */
  it('marks existing findings as clinician overrides', () => {
    expect(sql).toMatch(/"classificationOverridden" = true/);
    expect(sql).toMatch(/"derivedClassification" = a\."classification"/);
  });

  /*
    Defaulting collection time to the migration clock would date every historical assessment to
    the deploy, and the column exists so a longitudinal view can order them.
  */
  it('backfills provenance from the record and its encounter', () => {
    expect(sql).toMatch(/"collectedAt" = a\."createdAt"/);
    expect(sql).toMatch(/"authoredByUserId" = e\."createdByUserId"/);
  });

  /* NOT NULL on a populated table only works after the backfill. */
  it('adds the author column nullable and constrains it afterwards', () => {
    const added = sql.indexOf('ADD COLUMN     "authoredByUserId" UUID;');
    const backfilled = sql.indexOf('"authoredByUserId" = e."createdByUserId"');
    const constrained = sql.indexOf('ALTER COLUMN "authoredByUserId" SET NOT NULL');
    expect(added).toBeGreaterThan(-1);
    expect(backfilled).toBeGreaterThan(added);
    expect(constrained).toBeGreaterThan(backfilled);
  });

  it('fails loudly rather than inventing an author for an orphaned row', () => {
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  /*
    `rls-coverage.spec.ts` discovers the table and asserts these independently. Naming them here
    too keeps the reason next to the SQL: enabling is not enforcing, because PostgreSQL exempts a
    table's owner from its own policies unless the table is forced, and the app connects as owner.
  */
  it('protects the new table with enabled, forced row level security and a policy', () => {
    expect(sql).toMatch(/ALTER TABLE "EncounterMedicationAdherence" ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE "EncounterMedicationAdherence" FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY "[^"]+" ON "EncounterMedicationAdherence"/);
    expect(sql).toMatch(/app\.can_access_clinic\("clinicId"\)/);
  });

  it('keeps one condition out of the other condition columns', () => {
    expect(sql).toMatch(/EncounterMedicationAdherence_context_fields_check/);
  });

  it('constrains the readings the application also validates', () => {
    for (const constraint of [
      'HypertensionAssessment_repeat_bp_range_check',
      'HypertensionAssessment_repeat_bp_order_check',
      'HypertensionAssessment_home_bp_check',
      'HypertensionAssessment_bp_goal_check',
      'HypertensionAssessment_year_diagnosed_check',
      'HypertensionAssessment_jsonb_object_check',
      'HypertensionAssessment_escalation_consistency_check',
    ]) {
      expect(sql).toContain(constraint);
    }
  });

  /*
    Adding an enum value is legal inside a transaction; using one added in the same transaction is
    not. Nothing here writes CURRENT_OCCASIONAL or CURRENT_DAILY, which is what makes this safe.
  */
  it('extends the tobacco scale without writing the new members', () => {
    expect(sql).toMatch(/ALTER TYPE "TobaccoUseStatus" ADD VALUE 'CURRENT_OCCASIONAL'/);
    expect(sql).toMatch(/ALTER TYPE "TobaccoUseStatus" ADD VALUE 'CURRENT_DAILY'/);
    const writes = sql.match(/(UPDATE|INSERT)[\s\S]*?CURRENT_(OCCASIONAL|DAILY)/g);
    expect(writes).toBeNull();
  });

  it('explains itself to whoever reads it next', () => {
    expect(sql.split('\n')[0]).toMatch(/^-- /);
    expect(sql.slice(0, 2000)).toMatch(/#114/);
  });
});
