import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORTAL_DIR = resolve(__dirname, '.');

function portalSources(): Array<[string, string]> {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
    });
  return walk(PORTAL_DIR).map((file) => [
    file.replace(`${PORTAL_DIR}/`, ''),
    readFileSync(file, 'utf8'),
  ]);
}

/**
 * Patient portal exposure is out of scope for v1 of the clinical-records initiative, which means
 * the portal must not have quietly acquired any of the new fields while those features shipped.
 *
 * The risk is not a deliberate new endpoint; it is a shared serializer or a widened select picking
 * up a column that was added to a table the portal already reads.
 */
describe('the patient portal gained no clinical-records data', () => {
  const sources = portalSources();

  const FORBIDDEN = [
    // Clinical notes
    'clinicalNote',
    'signedAssessment',
    // Medication reconciliation and pharmacy history
    'patientMedicationRecord',
    'patientMedicationRevision',
    'medicationReconciliationEvent',
    'patientPharmacyRecord',
    'patientPharmacyPreference',
    // Longitudinal medical history and allergies
    'medicalHistoryRecord',
    'medicalHistoryRevision',
    'allergyKind',
    'allergySeverity',
    // Tobacco screening
    'tobaccoScreening',
    // Granular residence
    'residentialDistrict',
    'residentialCommunity',
    'residentialAddressNote',
  ];

  it.each(FORBIDDEN)('does not reference %s anywhere', (identifier) => {
    const offenders = sources
      .filter(([, source]) => new RegExp(`\\b${identifier}\\b`, 'i').test(source))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('keeps expanded vitals behind the staff-only flag', () => {
    const service = readFileSync(join(PORTAL_DIR, 'patient-portal.service.ts'), 'utf8');

    // listTrends takes an explicit includeExpandedVitals argument. The patient-facing caller
    // passes false and the staff caller passes true; if that ever inverts, a patient starts
    // receiving clinical measurement detail through the trends endpoint.
    expect(service).toMatch(/listTrendsForAuthenticatedPatient[\s\S]{0,400}false\s*\)/);
    expect(service).toMatch(/listTrendsForStaff[\s\S]{0,400}true\s*\)/);
  });

  it('exposes no route that reads a clinical record type by name', () => {
    for (const [name, source] of sources) {
      if (!name.endsWith('.controller.ts')) continue;
      for (const route of source.match(/@(Get|Post|Patch|Put|Delete)\([^)]*\)/g) ?? []) {
        expect(route).not.toMatch(/note|medication|pharmacy|medical-history|tobacco/i);
      }
    }
  });
});
