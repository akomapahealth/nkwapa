/**
 * An explicit export decision for every field of every clinical record the initiative added.
 *
 * The research pack is built from fixed header lists, which is a good defence against accidental
 * inclusion but says nothing about omission: a table nobody wired up and a field nobody thought
 * about look identical to a reader, and both look identical to a passing test. Medication
 * reconciliation and clinical notes were in exactly that state -- absent, with nothing recording
 * whether that was a decision.
 *
 * Naming every field forces the question once, in a place a reviewer can read, and the companion
 * drift test fails when a migration adds a field this file has not answered for.
 */
export type ResearchDisposition =
  /** Exported as recorded. */
  | 'EXPORTED'
  /** Exported with reduced precision or granularity. */
  | 'COARSENED'
  /** Names or locates a person. */
  | 'EXCLUDED_DIRECT_IDENTIFIER'
  /** Free text, which cannot be de-identified reliably. */
  | 'EXCLUDED_FREE_TEXT'
  /** Narrows a population enough to re-identify within it. */
  | 'EXCLUDED_QUASI_IDENTIFIER'
  /** Internal bookkeeping with no research meaning. */
  | 'EXCLUDED_OPERATIONAL'
  /** Identifies a member of staff rather than a subject. */
  | 'EXCLUDED_STAFF_IDENTIFIER';

export interface ResearchFieldDecision {
  readonly disposition: ResearchDisposition;
  /** One sentence, written for a reviewer rather than a compiler. */
  readonly reason: string;
}

const EXPORTED = (reason: string): ResearchFieldDecision => ({ disposition: 'EXPORTED', reason });
const COARSENED = (reason: string): ResearchFieldDecision => ({ disposition: 'COARSENED', reason });
const FREE_TEXT: ResearchFieldDecision = {
  disposition: 'EXCLUDED_FREE_TEXT',
  reason:
    'Free text can carry names, places, and circumstances that no transform can reliably strip.',
};
const OPERATIONAL: ResearchFieldDecision = {
  disposition: 'EXCLUDED_OPERATIONAL',
  reason: 'Internal bookkeeping with no research meaning.',
};
const STAFF: ResearchFieldDecision = {
  disposition: 'EXCLUDED_STAFF_IDENTIFIER',
  reason: 'Identifies a member of staff, who is not a research subject.',
};
const KEYED: ResearchFieldDecision = {
  disposition: 'COARSENED',
  reason: 'Replaced by a clinic-salted HMAC key so records can be linked without being identified.',
};
const NOTE_CONTENT: ResearchFieldDecision = {
  disposition: 'EXCLUDED_FREE_TEXT',
  reason:
    'Clinical note narrative never leaves the clinic; it is excluded from every contract, not only this one.',
};

/** The clinical models the initiative added or extended. */
export const RESEARCH_SCOPED_MODELS = [
  'Vitals',
  'TobaccoScreening',
  'DiabetesScreening',
  'MedicalHistoryRecord',
  'MedicalHistoryRevision',
  'PatientMedicationRecord',
  'PatientMedicationRevision',
  'MedicationReconciliationEvent',
  'PatientPharmacyRecord',
  'PatientPharmacyRevision',
  'PatientPharmacyPreference',
  'ClinicalNote',
  'ClinicalNoteAddendum',
] as const;

export type ResearchScopedModel = (typeof RESEARCH_SCOPED_MODELS)[number];

/**
 * Identity and lifecycle fields, composed per model rather than spread blindly, so the registry
 * never claims a decision for a column a model does not have.
 */
const CREATED_AT = COARSENED(
  'Rounded to a timestamp bucket so a record cannot be matched by its exact time.',
);

const base = { id: KEYED, createdAt: CREATED_AT } satisfies Record<string, ResearchFieldDecision>;
const timestamped = { ...base, updatedAt: OPERATIONAL };
const clinicScoped = { ...timestamped, clinicId: KEYED };
const patientScoped = { ...clinicScoped, patientId: KEYED };
const encounterScoped = { ...clinicScoped, encounterId: KEYED };
const revision = { ...base, recordId: KEYED };

export const RESEARCH_FIELD_DECISIONS: Record<
  ResearchScopedModel,
  Record<string, ResearchFieldDecision>
> = {
  Vitals: {
    ...encounterScoped,
    systolicBp: EXPORTED('Core blood pressure measure.'),
    diastolicBp: EXPORTED('Core blood pressure measure.'),
    bpSite: EXPORTED('Measurement context needed to interpret the reading.'),
    bpSiteOther: FREE_TEXT,
    patientPosition: EXPORTED('Measurement context needed to interpret the reading.'),
    patientPositionOther: FREE_TEXT,
    cuffSize: EXPORTED('Measurement context needed to interpret the reading.'),
    cuffSizeOther: FREE_TEXT,
    pulseBpm: EXPORTED('Core vital sign.'),
    temperatureCelsius: EXPORTED('Core vital sign, normalised to one unit.'),
    temperatureSource: EXPORTED('Measurement context needed to interpret the reading.'),
    temperatureSourceOther: FREE_TEXT,
    respiratoryRate: EXPORTED('Core vital sign.'),
    spo2Percent: EXPORTED('Core vital sign.'),
    weightKg: EXPORTED('Anthropometric measure.'),
    heightCm: EXPORTED('Anthropometric measure.'),
    bmi: EXPORTED('Derived anthropometric measure.'),
    notes: FREE_TEXT,
  },
  TobaccoScreening: {
    ...encounterScoped,
    smokingStatus: EXPORTED('Screening outcome, the point of the record.'),
    smokelessTobaccoStatus: EXPORTED('Screening outcome.'),
    passiveExposure: EXPORTED('Screening outcome.'),
    readinessToQuit: EXPORTED('Screening outcome, used for intervention analysis.'),
    counselingGiven: EXPORTED('Whether an intervention followed the screening.'),
    reviewedByUserId: STAFF,
    reviewedAt: COARSENED('Rounded to a timestamp bucket.'),
  },
  DiabetesScreening: {
    ...encounterScoped,
    glucoseMgDl: EXPORTED('Primary screening measure.'),
    glucoseType: EXPORTED('Fasting and random glucose are not comparable without it.'),
    hba1cPercent: EXPORTED('Primary screening measure.'),
    symptoms: EXPORTED('A closed set of coded symptoms, so it carries no free text.'),
    symptomsJson: FREE_TEXT,
    legacySymptomsUnmapped: EXPORTED(
      'Flags a record whose legacy symptom text could not be fully mapped, so an analysis can exclude it rather than treat an incomplete list as complete.',
    ),
    notes: FREE_TEXT,
    collectedAt: COARSENED('Rounded to a timestamp bucket.'),
    authoredByUserId: STAFF,
  },
  MedicalHistoryRecord: {
    ...patientScoped,
    category: EXPORTED('Distinguishes a condition from an allergy or social history.'),
    currentRevisionId: OPERATIONAL,
  },
  MedicalHistoryRevision: {
    ...revision,
    revisionNumber: EXPORTED('Orders the longitudinal history without revealing when it changed.'),
    status: EXPORTED('Whether the entry is active, resolved, or retracted.'),
    onsetDate: COARSENED(
      'Reduced to month precision; an exact onset date is close to a unique fingerprint.',
    ),
    occurrenceDate: COARSENED('Reduced to month precision.'),
    resolvedDate: COARSENED('Reduced to month precision.'),
    detailsSchemaVersion: OPERATIONAL,
    details: {
      disposition: 'EXCLUDED_FREE_TEXT',
      reason:
        'A JSON blob whose shape varies by category and can hold free text; the coded fields worth exporting are lifted out individually.',
    },
    notes: FREE_TEXT,
    sourceEncounterId: KEYED,
    authoredByUserId: STAFF,
  },
  PatientMedicationRecord: {
    ...patientScoped,
    currentRevisionId: OPERATIONAL,
    recordedByUserId: STAFF,
  },
  PatientMedicationRevision: {
    ...revision,
    revisionNumber: EXPORTED('Orders the medication history.'),
    medicationName: {
      disposition: 'EXCLUDED_FREE_TEXT',
      reason:
        'Patient-reported and free text. The coded drugId is the analysable form; the raw name is not.',
    },
    drugId: KEYED,
    strength: EXPORTED('Dose analysis is meaningless without it.'),
    dose: EXPORTED('Dose analysis is meaningless without it.'),
    doseUnit: EXPORTED('Dose analysis is meaningless without it.'),
    route: EXPORTED('Coded administration route.'),
    frequency: EXPORTED('Coded frequency.'),
    duration: EXPORTED('Coded duration.'),
    startDate: COARSENED('Reduced to month precision.'),
    endDate: COARSENED('Reduced to month precision.'),
    indication: FREE_TEXT,
    status: EXPORTED('Whether the medication is current, stopped, or held.'),
    notes: FREE_TEXT,
    sourceEncounterId: KEYED,
    sourceType: EXPORTED('Whether the entry was patient-reported or clinician-recorded.'),
    authoredByUserId: STAFF,
    reconciledByUserId: STAFF,
    lastReconciledAt: COARSENED('Rounded to a timestamp bucket.'),
  },
  MedicationReconciliationEvent: {
    ...base,
    clinicId: KEYED,
    patientId: KEYED,
    outcome: EXPORTED('The reconciliation result, which is the analysable part of the event.'),
    sourceEncounterId: KEYED,
    reconciledByUserId: STAFF,
    notes: FREE_TEXT,
  },
  PatientPharmacyRecord: {
    ...patientScoped,
    currentRevisionId: OPERATIONAL,
    recordedByUserId: STAFF,
  },
  PatientPharmacyRevision: {
    ...revision,
    revisionNumber: OPERATIONAL,
    name: {
      disposition: 'EXCLUDED_DIRECT_IDENTIFIER',
      reason: 'A named pharmacy locates the patient as precisely as a street address.',
    },
    phoneE164: {
      disposition: 'EXCLUDED_DIRECT_IDENTIFIER',
      reason: 'A contact number.',
    },
    addressLine1: {
      disposition: 'EXCLUDED_DIRECT_IDENTIFIER',
      reason: 'A street address.',
    },
    addressLine2: { disposition: 'EXCLUDED_DIRECT_IDENTIFIER', reason: 'A street address.' },
    city: {
      disposition: 'EXCLUDED_QUASI_IDENTIFIER',
      reason: 'Combined with age and condition, a city narrows a population sharply.',
    },
    region: EXPORTED('Coarse geography, the same granularity the subject record exports.'),
    postalCode: {
      disposition: 'EXCLUDED_QUASI_IDENTIFIER',
      reason: 'A postal code identifies a small area.',
    },
    countryCode: EXPORTED('Coarse geography.'),
    addressText: {
      disposition: 'EXCLUDED_DIRECT_IDENTIFIER',
      reason: 'Free-text address.',
    },
    notes: FREE_TEXT,
    authoredByUserId: STAFF,
  },
  PatientPharmacyPreference: {
    ...patientScoped,
    pharmacyRecordId: KEYED,
    effectiveFrom: COARSENED('Reduced to month precision.'),
    effectiveTo: COARSENED('Reduced to month precision.'),
    notes: FREE_TEXT,
    setByUserId: STAFF,
    endedByUserId: STAFF,
  },
  ClinicalNote: {
    ...patientScoped,
    encounterId: KEYED,
    status: {
      disposition: 'EXCLUDED_OPERATIONAL',
      reason:
        'Note lifecycle is clinic operations, not research. Exporting it would also reveal which encounters have notes.',
    },
    version: OPERATIONAL,
    history: NOTE_CONTENT,
    assessment: NOTE_CONTENT,
    plan: NOTE_CONTENT,
    signedHistory: NOTE_CONTENT,
    signedAssessment: NOTE_CONTENT,
    signedPlan: NOTE_CONTENT,
    signedContentHash: {
      disposition: 'EXCLUDED_OPERATIONAL',
      reason: 'An integrity check for the clinic, and a way to confirm a guess at note content.',
    },
    authorUserId: STAFF,
    authorRole: OPERATIONAL,
    assignmentId: OPERATIONAL,
    assignedVolunteerId: STAFF,
    assignedVolunteerNameSnapshot: STAFF,
    assignedDoctorId: STAFF,
    assignedDoctorNameSnapshot: STAFF,
    assignmentAssignedAtSnapshot: OPERATIONAL,
    submittedByUserId: STAFF,
    submittedAt: OPERATIONAL,
    cosignedByUserId: STAFF,
    cosignedAt: OPERATIONAL,
  },
  ClinicalNoteAddendum: {
    ...base,
    clinicId: KEYED,
    clinicalNoteId: OPERATIONAL,
    authorUserId: STAFF,
    reason: NOTE_CONTENT,
    content: NOTE_CONTENT,
  },
};

/** Models with no exported field at all, so the pack contains no file for them. */
export function fullyExcludedModels(): ResearchScopedModel[] {
  return RESEARCH_SCOPED_MODELS.filter((model) =>
    Object.values(RESEARCH_FIELD_DECISIONS[model]).every(
      (decision) => decision.disposition !== 'EXPORTED',
    ),
  );
}
