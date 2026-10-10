import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('patient duplicate review migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../prisma/migrations/20260903120000_patient_duplicate_review/migration.sql',
    ),
    'utf8',
  );

  const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');

  it('creates the three decision states', () => {
    expect(migration).toContain(
      "CREATE TYPE \"PatientDuplicateReviewStatus\" AS ENUM ('OPEN', 'DISMISSED', 'CONFIRMED')",
    );
  });

  it('keys a decision on the sorted pair so the same two charts cannot be reviewed twice', () => {
    expect(migration).toContain('"pairKey" VARCHAR(80) NOT NULL');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "PatientDuplicateReview_pairKey_key" ON "PatientDuplicateReview"("pairKey")',
    );
  });

  it('leaves clinicId nullable so a cross-clinic pair belongs to neither clinic', () => {
    expect(migration).toContain('"clinicId" UUID,');
    expect(migration).not.toContain('"clinicId" UUID NOT NULL');
  });

  it('cascades every reference so no decision outlives the chart it describes', () => {
    for (const column of ['clinicId', 'patientAId', 'patientBId', 'reviewedByUserId']) {
      expect(migration).toContain(`"PatientDuplicateReview_${column}_fkey"`);
    }
    expect(migration.match(/ON DELETE CASCADE/g)).toHaveLength(4);
  });

  it('enables and forces row level security in this file rather than a later sweep', () => {
    expect(migration).toContain('ALTER TABLE "PatientDuplicateReview" ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('ALTER TABLE "PatientDuplicateReview" FORCE ROW LEVEL SECURITY;');
  });

  it('scopes rows to the clinic, and unowned rows to system admins only', () => {
    expect(migration).toContain(
      'CREATE POLICY "PatientDuplicateReview_scope_policy" ON "PatientDuplicateReview"',
    );
    const disjunction =
      '("clinicId" IS NULL AND app.is_system_admin())\n' +
      '    OR ("clinicId" IS NOT NULL AND app.can_access_clinic("clinicId"))';
    // Once in USING and once in WITH CHECK: a policy that only guards reads lets a clinic
    // user write a row they would then be unable to see.
    expect(migration.split(disjunction)).toHaveLength(3);
  });

  it('records the decision, never the candidate, so the queue stays recomputable', () => {
    expect(migration).not.toMatch(/ALTER TABLE "Patient"\s/);
    expect(migration).not.toContain('UPDATE "Patient"');
  });

  it('matches the Prisma model the application reads through', () => {
    expect(schema).toContain('model PatientDuplicateReview {');
    expect(schema).toContain('pairKey    String @unique @db.VarChar(80)');
    expect(schema).toContain('clinicId String? @db.Uuid');
    expect(schema).toContain('status PatientDuplicateReviewStatus @default(OPEN)');
  });
});
