import {
  buildChartHref,
  buildEncounterHref,
  enabledChartFeatureFlags,
  getAccessibleChartSections,
  reconcileChartSections,
  resolveChartTab,
  type PatientChartSectionId,
} from './patient-chart';

/**
 * Permissions each role actually receives, mirrored from
 * apps/api/src/auth/constants/permissions.ts. The API-side matrix is locked down in
 * apps/api/src/auth/permissions.spec.ts; this asserts the chart renders from the same truth.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SYSTEM_ADMIN: ['*'],
  DIRECTOR: [
    'PATIENT.READ',
    'ENCOUNTER.READ',
    'SCREENING.READ',
    'MEDICAL_HISTORY.READ',
    'MEDICATION_RECONCILIATION.READ',
    'PATIENT.SELF_REPORT.READ',
    'CLINICAL_NOTE.STATUS.READ',
  ],
  MANAGER: [
    'PATIENT.READ',
    'ENCOUNTER.READ',
    'SCREENING.READ',
    'MEDICAL_HISTORY.READ',
    'MEDICATION_RECONCILIATION.READ',
    'PATIENT.SELF_REPORT.READ',
    'CLINICAL_NOTE.STATUS.READ',
  ],
  DOCTOR: [
    'PATIENT.READ',
    'ENCOUNTER.READ',
    'SCREENING.READ',
    'MEDICAL_HISTORY.READ',
    'MEDICATION_RECONCILIATION.READ',
    'PATIENT.SELF_REPORT.READ',
    'CLINICAL_NOTE.READ',
  ],
  VOLUNTEER: [
    'PATIENT.READ',
    'ENCOUNTER.READ',
    'SCREENING.READ',
    'MEDICAL_HISTORY.READ',
    'MEDICATION_RECONCILIATION.READ',
    'PATIENT.SELF_REPORT.READ',
    'CLINICAL_NOTE.READ',
    'CONSENT.RECORD',
  ],
  PATIENT: ['PATIENT.PORTAL.READ_SELF'],
};

const enableAllFlags = () => {
  process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED = 'true';
  process.env.NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED = 'true';
  process.env.NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED = 'true';
};

const clearFlags = () => {
  delete process.env.NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED;
  delete process.env.NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED;
  delete process.env.NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED;
};

const sectionIdsFor = (role: string) =>
  getAccessibleChartSections(ROLE_PERMISSIONS[role]).map((section) => section.id);

describe('patient chart tab registry', () => {
  beforeEach(enableAllFlags);
  afterEach(clearFlags);

  describe('feature flags', () => {
    it('reports only the flags that are enabled', () => {
      expect(enabledChartFeatureFlags()).toEqual([
        'medicalHistory',
        'medicationReconciliation',
        'clinicalNotes',
      ]);
      clearFlags();
      expect(enabledChartFeatureFlags()).toEqual([]);
    });

    it('hides flagged sections when their flag is off', () => {
      process.env.NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED = 'false';
      expect(sectionIdsFor('DOCTOR')).not.toContain('notes');
      expect(sectionIdsFor('DOCTOR')).toContain('vitals');
    });
  });

  describe('per-role tab visibility', () => {
    it('gives a system admin every section', () => {
      expect(sectionIdsFor('SYSTEM_ADMIN')).toEqual([
        'overview',
        'vitals',
        'medications',
        'diabetes',
        'medical-history',
        'notes',
        'visits',
        'self-reports',
        'consent',
      ]);
    });

    it.each(['DOCTOR', 'VOLUNTEER'])('shows the notes tab to a %s', (role) => {
      expect(sectionIdsFor(role)).toContain('notes');
    });

    it.each(['DIRECTOR', 'MANAGER'])('hides the notes tab from a %s', (role) => {
      expect(sectionIdsFor(role)).not.toContain('notes');
    });

    it('shows the diabetes tab to a volunteer now that they hold SCREENING.READ', () => {
      expect(sectionIdsFor('VOLUNTEER')).toContain('diabetes');
    });

    it('shows the consent tab only to a consent recorder', () => {
      expect(sectionIdsFor('VOLUNTEER')).toContain('consent');
      expect(sectionIdsFor('DOCTOR')).not.toContain('consent');
    });

    it('gives a portal patient role no chart sections at all', () => {
      expect(sectionIdsFor('PATIENT')).toEqual([]);
    });

    it.each(['DIRECTOR', 'MANAGER', 'DOCTOR', 'VOLUNTEER'])(
      'always offers overview, vitals, and visits to a %s',
      (role) => {
        const ids = sectionIdsFor(role);
        expect(ids).toEqual(expect.arrayContaining(['overview', 'vitals', 'visits']));
      },
    );
  });

  describe('server reconciliation', () => {
    it('narrows the local list to what the server served', () => {
      const local = getAccessibleChartSections(ROLE_PERMISSIONS.DOCTOR);
      const reconciled = reconcileChartSections(local, ['overview', 'vitals']);
      expect(reconciled.map((s) => s.id)).toEqual(['overview', 'vitals']);
    });

    it('never adds a section the client did not already allow', () => {
      const local = getAccessibleChartSections(ROLE_PERMISSIONS.MANAGER);
      const reconciled = reconcileChartSections(local, [
        'notes' as PatientChartSectionId,
        'overview',
      ]);
      expect(reconciled.map((s) => s.id)).toEqual(['overview']);
    });

    it('keeps the local list while the summary has not loaded yet', () => {
      const local = getAccessibleChartSections(ROLE_PERMISSIONS.DOCTOR);
      expect(reconcileChartSections(local, null).map((s) => s.id)).toEqual(local.map((s) => s.id));
    });
  });

  describe('deep links', () => {
    const doctorSections = () => getAccessibleChartSections(ROLE_PERMISSIONS.DOCTOR);

    it('honours an authorised tab', () => {
      expect(resolveChartTab('visits', doctorSections())).toBe('visits');
    });

    it('falls back to overview for a tab the role cannot open', () => {
      expect(resolveChartTab('consent', doctorSections())).toBe('overview');
    });

    it('falls back for unknown and legacy tab names', () => {
      // Legacy chart used "trends", "encounters", and "clinical-notes".
      for (const legacy of ['trends', 'encounters', 'clinical-notes', 'nonsense', '']) {
        expect(resolveChartTab(legacy, doctorSections())).toBe('overview');
      }
    });

    it('returns null when the role can open nothing', () => {
      expect(resolveChartTab('overview', [])).toBeNull();
    });

    it('builds stable chart and encounter links that keep clinic context in the path', () => {
      expect(buildChartHref('c-1', 'p-1', 'vitals')).toBe('/clinics/c-1/patients/p-1?tab=vitals');
      expect(buildChartHref('c-1', 'p-1')).toBe('/clinics/c-1/patients/p-1');
      expect(buildEncounterHref('c-1', 'e-1')).toBe('/clinics/c-1/encounters/e-1');
    });

    it('encodes ids that would otherwise break the path', () => {
      expect(buildChartHref('c/1', 'p 1', 'vitals')).toBe(
        '/clinics/c%2F1/patients/p%201?tab=vitals',
      );
    });
  });
});
