import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('clinical notes migration', () => {
  const migration = readFileSync(
    resolve(__dirname, '../prisma/migrations/20260813090000_add_clinical_notes/migration.sql'),
    'utf8',
  );

  it('creates one canonical HAP note and append-only addenda', () => {
    expect(migration).toContain('CREATE TABLE "ClinicalNote"');
    expect(migration).toContain('CREATE TABLE "ClinicalNoteAddendum"');
    expect(migration).toContain('CREATE UNIQUE INDEX "ClinicalNote_encounterId_key"');
    expect(migration).toContain('"history" TEXT');
    expect(migration).toContain('"assessment" TEXT');
    expect(migration).toContain('"plan" TEXT');
  });

  it('enforces lifecycle and immutable signed content at the database boundary', () => {
    expect(migration).toContain('"ClinicalNote_state_check"');
    expect(migration).toContain('"ClinicalNote_immutability_guard"');
    expect(migration).toContain('Signed clinical note content is immutable');
    expect(migration).toContain('Submitted or signed clinical notes cannot be deleted');
    expect(migration).toContain('"ClinicalNoteAddendum_append_only_guard"');
  });

  it('requires explicit clinical roles instead of system-admin wildcard access', () => {
    expect(migration).toContain('app.has_clinic_role');
    expect(migration).toContain("ARRAY['DOCTOR', 'VOLUNTEER']");
    expect(migration).toContain('CREATE POLICY "ClinicalNote_clinical_role_policy"');
    expect(migration).toContain('CREATE POLICY "ClinicalNoteAddendum_clinical_role_policy"');
  });

  it('exposes only an authorization-checked aggregate pending count', () => {
    expect(migration).toContain('app.clinical_note_pending_count');
    expect(migration).toContain("ARRAY['DIRECTOR', 'MANAGER', 'DOCTOR', 'VOLUNTEER']");
  });
});
