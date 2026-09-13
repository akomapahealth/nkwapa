/** What a narrative generator is given, and what it returns. */

export interface NarrativeVitals {
  systolicBp: number | null;
  diastolicBp: number | null;
  pulseBpm: number | null;
}

export interface NarrativeClinicianPlan {
  items: string[];
  other: string | null;
  bpGoalSystolic?: number | null;
  bpGoalDiastolic?: number | null;
  followUpWindow: string;
  followUpOther: string | null;
  followUpOwner: string;
  comments: string | null;
}

export interface NarrativeInput {
  patientName: string;
  /** The stored assessment or screening row. */
  assessment: Record<string, unknown>;
  vitals?: NarrativeVitals | null;
  /** Rendered medication lines, e.g. "Amlodipine 10 mg once daily". */
  medications?: readonly string[];
  /**
   * Omitted entirely for a reader without `CAREPLAN.CLINICIAN_PLAN`.
   *
   * Passing null rather than an empty object is what keeps a volunteer's generated note from
   * containing an empty "Supervising clinician plan" heading that tells them one exists.
   */
  clinicianPlan?: NarrativeClinicianPlan | null;
}

/** The three columns `ClinicalNote` stores. */
export interface HapSections {
  history: string;
  assessment: string;
  plan: string;
}
