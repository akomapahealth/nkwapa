import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('patient merge record migration', () => {
  const migration = readFileSync(
    resolve(__dirname, '../prisma/migrations/20260904120000_patient_merge_record/migration.sql'),
    'utf8',
  );

  const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');

  it('records one row per retired chart, and only one', () => {
    // A chart is merged away exactly once. Without the constraint a retried request writes a
    // second history for the same event.
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "PatientMergeRecord_sourcePatientId_key" ON "PatientMergeRecord"("sourcePatientId")',
    );
  });

  it('owns the merge by a clinic, because a merge cannot span two', () => {
    expect(migration).toContain('"clinicId" UUID NOT NULL');
    // The nullable-owner shape PatientDuplicateReview needs would be wrong here: noticing a
    // suspected duplicate spans clinics, merging one does not.
    expect(migration).not.toContain('"clinicId" UUID,');
  });

  it('keeps the counts that make a merge explainable afterwards', () => {
    expect(migration).toContain('"movedCountsJson" TEXT NOT NULL');
    expect(migration).toContain('"sourcePatientCode" VARCHAR(32) NOT NULL');
    expect(migration).toContain('"tombstonePatientCode" VARCHAR(32) NOT NULL');
  });

  it('cascades every reference so no record outlives what it describes', () => {
    for (const column of ['clinicId', 'canonicalPatientId', 'sourcePatientId', 'mergedByUserId']) {
      expect(migration).toContain(`"PatientMergeRecord_${column}_fkey"`);
    }
    expect(migration.match(/ON DELETE CASCADE/g)).toHaveLength(4);
  });

  it('does not reference AuditEvent, so the immutable trail survives a cascade', () => {
    expect(migration).not.toContain('REFERENCES "AuditEvent"');
  });

  it('enables and forces row level security in this file rather than a later sweep', () => {
    expect(migration).toContain('ALTER TABLE "PatientMergeRecord" ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('ALTER TABLE "PatientMergeRecord" FORCE ROW LEVEL SECURITY;');
  });

  it('scopes rows to the clinic that owns the merge', () => {
    expect(migration).toContain(
      'CREATE POLICY "PatientMergeRecord_scope_policy" ON "PatientMergeRecord"',
    );
    expect(migration).toContain('USING (app.can_access_clinic("clinicId"))');
    expect(migration).toContain('WITH CHECK (app.can_access_clinic("clinicId"))');
  });

  it('is declared in the Prisma schema with the same shape', () => {
    expect(schema).toContain('model PatientMergeRecord {');
    expect(schema).toContain('sourcePatientId    String @unique @db.Uuid');
    expect(schema).toContain('@@index([clinicId, mergedAt])');
  });
});
