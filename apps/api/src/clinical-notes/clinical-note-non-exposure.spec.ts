import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SYNC_ENTITY_PERMISSIONS, isSyncEntityType } from '../sync/sync-permissions';
import { SYNC_PATIENT_SELECT } from '../sync/sync-projection';
import { CLINICAL_RECORD_SURFACES } from '../testing/clinical-record-surfaces';

const API_SRC = resolve(__dirname, '..');
const SCHEMA = readFileSync(
  resolve(__dirname, '../../../../packages/db/prisma/schema.prisma'),
  'utf8',
);

/** The note fields that carry clinical narrative, drafted or signed. */
const NOTE_CONTENT_FIELDS = [
  'history',
  'assessment',
  'plan',
  'signedHistory',
  'signedAssessment',
  'signedPlan',
] as const;

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFilesUnder(full);
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

function readModule(relative: string): string {
  return readFileSync(resolve(API_SRC, relative), 'utf8');
}

/**
 * Signed HAP notes are the most sensitive record the initiative added, and the surfaces most
 * likely to leak them are the ones nobody thinks of as note surfaces: the offline pull, a research
 * export, a dashboard tile, an audit payload, the patient portal.
 *
 * These assertions are about reachability rather than any single handler, so they are deliberately
 * coarse: a note field appearing anywhere in those modules is a finding to investigate, even if the
 * particular use turns out to be benign.
 */
describe('signed clinical notes stay where they belong', () => {
  it('is not a replayable entity type', () => {
    expect(isSyncEntityType('clinical_note')).toBe(false);
    expect(isSyncEntityType('clinical_note_addendum')).toBe(false);
    expect(Object.keys(SYNC_ENTITY_PERMISSIONS).filter((t) => t.includes('note'))).toEqual([]);
  });

  it('is absent from the offline pull', () => {
    const pull = readModule('sync/sync.service.ts');
    expect(pull).not.toMatch(/prisma\.clinicalNote/);
    expect(pull).not.toMatch(/prisma\.clinicalNoteAddendum/);

    const dto = readModule('sync/dto/sync-pull-response.dto.ts');
    expect(dto.toLowerCase()).not.toContain('clinicalnote');

    for (const field of NOTE_CONTENT_FIELDS) {
      expect(Object.keys(SYNC_PATIENT_SELECT)).not.toContain(field);
    }
  });

  it.each(['research', 'patient-portal'])('is absent from the %s module', (module) => {
    for (const file of sourceFilesUnder(resolve(API_SRC, module))) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/clinicalNote|ClinicalNote/);
      for (const field of NOTE_CONTENT_FIELDS) {
        expect(source).not.toMatch(new RegExp(`\\b${field}\\b`));
      }
    }
  });

  it('reaches the dashboard as a count and nothing else', () => {
    // Managers and directors are entitled to operational status: how many notes await cosign.
    // They are not entitled to what any note says, so the only permitted access is an aggregate.
    for (const file of sourceFilesUnder(resolve(API_SRC, 'dashboard'))) {
      const source = readFileSync(file, 'utf8');

      for (const access of source.match(/prisma\.clinicalNote\w*\.\w+/g) ?? []) {
        expect(access).toMatch(/\.count$/);
      }
      for (const field of NOTE_CONTENT_FIELDS) {
        expect(source).not.toMatch(new RegExp(`\\b${field}\\b`));
      }
    }
  });

  it('reaches the patient chart as a count, never as content', () => {
    const chart = readModule('patient-chart/patient-chart.service.ts');

    // The chart may report how many notes await cosign; it must never read their text.
    for (const access of chart.match(/prisma\.clinicalNote\w*\.\w+/g) ?? []) {
      expect(access).toMatch(/\.count$/);
    }
    for (const field of NOTE_CONTENT_FIELDS.filter((f) => f.startsWith('signed'))) {
      expect(chart).not.toContain(field);
    }
    expect(chart).toContain('CLINICAL_NOTE_STATUS_READ');
  });

  it('never puts note text in an audit payload', () => {
    const service = readModule('clinical-notes/clinical-note.service.ts');
    // Audit events carry identifiers and transitions. beforeJson/afterJson would carry narrative.
    const auditCalls = service.match(/logWrite\(\{[\s\S]*?\}\)/g) ?? [];
    expect(auditCalls.length).toBeGreaterThan(0);
    for (const call of auditCalls) {
      for (const field of NOTE_CONTENT_FIELDS) {
        expect(call).not.toContain(field);
      }
    }
  });

  it('does not expose audit payload columns over HTTP at all', () => {
    const controller = readModule('audit/audit.controller.ts');
    const repository = readModule('audit/audit.service.ts');
    expect(`${controller}${repository}`).not.toMatch(/select:[\s\S]{0,400}beforeJson/);
  });

  it('is protected against mutation by the database, not only the service', () => {
    const migrations = resolve(__dirname, '../../../../packages/db/prisma/migrations');
    const sql = readdirSync(migrations)
      .filter((name) => /^\d/.test(name))
      .map((name) => readFileSync(join(migrations, name, 'migration.sql'), 'utf8'))
      .join('\n');

    // Application code can be bypassed by a script or a future endpoint; a trigger cannot.
    expect(sql).toMatch(/CREATE TRIGGER[\s\S]{0,200}"ClinicalNote"/);
    expect(sql).toContain('ALTER TABLE "ClinicalNote" FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "ClinicalNoteAddendum" FORCE ROW LEVEL SECURITY');
  });

  it('has no delete route for a note or an addendum', () => {
    const controller = readModule('clinical-notes/clinical-note.controller.ts');
    expect(controller).not.toMatch(/@Delete\(/);
  });

  it('is declared online-only in the record surface table', () => {
    const notes = CLINICAL_RECORD_SURFACES.find((s) => s.id === 'clinical-notes');
    expect(notes?.syncEntityTypes).toEqual([]);
  });

  it('keeps the note tables under row level security in the schema', () => {
    expect(SCHEMA).toContain('model ClinicalNote {');
    expect(SCHEMA).toContain('model ClinicalNoteAddendum {');
  });
});
