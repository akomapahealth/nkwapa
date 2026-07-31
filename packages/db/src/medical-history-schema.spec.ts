import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('medical history migration', () => {
  const migration = readFileSync(
    resolve(__dirname, '../prisma/migrations/20260731000000_add_medical_history/migration.sql'),
    'utf8',
  );

  it('creates stable records and immutable revision storage', () => {
    expect(migration).toContain('CREATE TABLE "MedicalHistoryRecord"');
    expect(migration).toContain('CREATE TABLE "MedicalHistoryRevision"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "MedicalHistoryRevision_recordId_revisionNumber_key"',
    );
    expect(migration).toContain('"currentRevisionId" UUID');
  });

  it('enforces structured details and valid clinical date ordering', () => {
    expect(migration).toContain('"MedicalHistoryRevision_details_object_check"');
    expect(migration).toContain('"MedicalHistoryRevision_resolved_date_check"');
    expect(migration).toContain('"revisionNumber" > 0');
  });

  it('enables tenant policies on records and revisions', () => {
    expect(migration).toContain('ALTER TABLE "MedicalHistoryRecord" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "MedicalHistoryRevision" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('app.can_access_clinic("clinicId")');
    expect(migration).toContain('"MedicalHistoryRevision_clinic_scope_policy"');
  });
});
