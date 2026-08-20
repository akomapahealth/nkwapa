import {
  PATIENT_CHART_SECTIONS,
  canAccessPatientChartSection,
  getPatientChartSection,
  isPatientChartSectionId,
  resolveAccessiblePatientChartSections,
  resolvePatientChartSectionId,
  type PatientChartFeatureFlag,
} from './patient-chart-sections';

const ALL_FLAGS: PatientChartFeatureFlag[] = [
  'medicalHistory',
  'medicationReconciliation',
  'clinicalNotes',
];

const ids = (permissions: string[], enabledFeatureFlags = ALL_FLAGS) =>
  resolveAccessiblePatientChartSections({ permissions, enabledFeatureFlags }).map((s) => s.id);

describe('patient chart sections', () => {
  it('presents current summaries before chronological history', () => {
    expect(PATIENT_CHART_SECTIONS.map((section) => section.id)).toEqual([
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

  it('gives every section a unique id and a non-empty label and description', () => {
    const seen = new Set<string>();
    for (const section of PATIENT_CHART_SECTIONS) {
      expect(seen.has(section.id)).toBe(false);
      seen.add(section.id);
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.description.length).toBeGreaterThan(0);
      expect(section.requiredPermission).toMatch(/^[A-Z_]+(\.[A-Z_]+)+$/);
    }
  });

  describe('access resolution', () => {
    it('grants everything to a wildcard permission holder', () => {
      expect(ids(['*'])).toHaveLength(PATIENT_CHART_SECTIONS.length);
    });

    it('grants nothing when no permissions are held', () => {
      expect(ids([])).toEqual([]);
    });

    it('omits a section whose feature flag is disabled even when permitted', () => {
      expect(ids(['*'], ['medicalHistory'])).not.toContain('notes');
      expect(ids(['*'], ['medicalHistory'])).not.toContain('medications');
      expect(ids(['*'], ['medicalHistory'])).toContain('medical-history');
    });

    it('keeps unflagged sections available when every flag is off', () => {
      expect(ids(['*'], [])).toEqual([
        'overview',
        'vitals',
        'diabetes',
        'visits',
        'self-reports',
        'consent',
      ]);
    });

    it('exposes notes only to a CLINICAL_NOTE.READ holder', () => {
      expect(ids(['PATIENT.READ', 'ENCOUNTER.READ'])).not.toContain('notes');
      expect(ids(['CLINICAL_NOTE.READ'])).toContain('notes');
      // Status-only readers must not reach note content.
      expect(ids(['CLINICAL_NOTE.STATUS.READ'])).not.toContain('notes');
    });

    it('ties vitals and visits to encounter read access', () => {
      expect(ids(['ENCOUNTER.READ'])).toEqual(['vitals', 'visits']);
    });

    it('answers single-section checks consistently with the full resolution', () => {
      const input = { permissions: ['SCREENING.READ'], enabledFeatureFlags: ALL_FLAGS };
      expect(canAccessPatientChartSection('diabetes', input)).toBe(true);
      expect(canAccessPatientChartSection('notes', input)).toBe(false);
    });
  });

  describe('deep-link resolution', () => {
    const accessible = resolveAccessiblePatientChartSections({
      permissions: ['PATIENT.READ', 'SCREENING.READ'],
      enabledFeatureFlags: ALL_FLAGS,
    });

    it('honours an authorised requested section', () => {
      expect(resolvePatientChartSectionId('diabetes', accessible)).toBe('diabetes');
    });

    it('falls back to the first accessible section for an unauthorised request', () => {
      expect(resolvePatientChartSectionId('notes', accessible)).toBe('overview');
    });

    it('falls back for unknown, empty, and missing values', () => {
      expect(resolvePatientChartSectionId('nonsense', accessible)).toBe('overview');
      expect(resolvePatientChartSectionId('', accessible)).toBe('overview');
      expect(resolvePatientChartSectionId(null, accessible)).toBe('overview');
      expect(resolvePatientChartSectionId(undefined, accessible)).toBe('overview');
    });

    it('returns null when the caller may see nothing', () => {
      expect(resolvePatientChartSectionId('overview', [])).toBeNull();
    });
  });

  describe('id helpers', () => {
    it('recognises only known section ids', () => {
      expect(isPatientChartSectionId('vitals')).toBe(true);
      expect(isPatientChartSectionId('trends')).toBe(false);
      expect(isPatientChartSectionId(42)).toBe(false);
      expect(isPatientChartSectionId(undefined)).toBe(false);
    });

    it('looks up a section by id', () => {
      expect(getPatientChartSection('visits').label).toBe('Visits');
    });
  });
});
