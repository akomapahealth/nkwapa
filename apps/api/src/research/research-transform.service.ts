import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeIdentificationService } from './de-identification.service';
import {
  GeneratedResearchPack,
  RESEARCH_DATASET_VERSION,
  RESEARCH_FILE_FORMAT,
  RESEARCH_POLICY_VERSION,
  type ResearchPackFile,
  sha256Hex,
} from './research-policy';
import { createStoredZip } from './zip.util';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_EXPORT_DIR = './data/research-exports';
const DEFAULT_RETENTION_DAYS = 30;
const SUBJECT_HEADERS = [
  'research_patient_key',
  'research_clinic_key',
  'sex',
  'birth_year',
  // Coarse geography only. District, community and the free-text address note
  // are deliberately excluded from research exports as re-identifying.
  'residential_region',
  'latest_consent_status',
];

const CHECKIN_HEADERS = [
  'research_checkin_key',
  'research_patient_key',
  'research_clinic_key',
  'checked_in_at',
  'source',
  'status',
  'research_encounter_key',
];

const ASSIGNMENT_HEADERS = [
  'research_assignment_key',
  'research_checkin_key',
  'research_patient_key',
  'research_clinic_key',
  'assigned_at',
  'status',
  'assigned_volunteer_role',
  'assigned_doctor_role',
];

const VITALS_HEADERS = [
  'research_encounter_key',
  'research_patient_key',
  'research_clinic_key',
  'encounter_status',
  'encounter_created_at',
  'recorded_at',
  'systolic_bp',
  'diastolic_bp',
  'bp_site',
  'patient_position',
  'cuff_size',
  'pulse_bpm',
  'temperature_celsius',
  'temperature_source',
  'respiratory_rate',
  'spo2_percent',
  'weight_kg',
  'height_cm',
  'bmi',
];

const TOBACCO_HEADERS = [
  'research_encounter_key',
  'research_patient_key',
  'research_clinic_key',
  'encounter_status',
  'encounter_created_at',
  'recorded_at',
  'smoking_status',
  'smokeless_tobacco_status',
  'passive_exposure',
  'readiness_to_quit',
  'counseling_given',
  'reviewed',
  'reviewed_at',
];

/**
 * One encounter-level row carrying both conditions.
 *
 * The hypertension columns were three until #114: a disposition of `EXPORTED` means nothing unless
 * a column exists for it, and hypertension had no registry entry at all, so the guided interview's
 * sixty columns reached no analysis. Every name below is `EXPORTED` or `COARSENED` in
 * `research-field-registry.ts`, and a spec now fails if an exported decision has no column here.
 */
const SCREENING_HEADERS = [
  'research_encounter_key',
  'research_patient_key',
  'research_clinic_key',
  'encounter_status',
  'encounter_created_at',
  'recorded_at',
  'glucose_mg_dl',
  'glucose_type',
  'hba1c_percent',
  'hypertension_classification',
  'hypertension_derived_classification',
  'hypertension_classification_overridden',
  'hypertension_suspected',
  'hypertension_confirmed',
  'hypertension_status',
  'hypertension_year_diagnosed',
  'hypertension_year_diagnosed_unknown',
  'hypertension_main_concern',
  'hypertension_usual_care_facility_status',
  'hypertension_repeat_performed',
  'hypertension_repeat_systolic_bp',
  'hypertension_repeat_diastolic_bp',
  'hypertension_repeat_position',
  'hypertension_repeat_cuff_size',
  'hypertension_repeat_measured_at',
  'hypertension_repeat_prompt_shown',
  'hypertension_home_monitor_status',
  'hypertension_home_check_frequency',
  'hypertension_home_systolic_avg',
  'hypertension_home_diastolic_avg',
  'hypertension_home_readings_unknown',
  'hypertension_home_reading_source',
  'hypertension_current_symptoms',
  'hypertension_urgent_review_required',
  'hypertension_urgent_review_reasons',
  'hypertension_medication_reminder_strategies',
  'hypertension_contributing_substances',
  'hypertension_relevant_conditions',
  'hypertension_pregnant_now',
  'hypertension_planning_pregnancy',
  'hypertension_kidney_function_testing',
  'hypertension_urine_protein_testing',
  'hypertension_cholesterol_testing',
  'hypertension_ecg_completed',
  'hypertension_statin_use',
  'hypertension_aspirin_use',
  'hypertension_clinician_review_requested',
  'hypertension_review_reasons',
  'hypertension_bp_goal_systolic',
  'hypertension_bp_goal_diastolic',
  'hypertension_follow_up_window',
  'hypertension_follow_up_owner',
  'hypertension_collected_at',
];

/**
 * One row per medication observed at one visit.
 *
 * Its own file rather than columns on the screenings row, because it is per-medication and that
 * row is per-encounter. The medication is never named: `research_medication_record_key` joins to
 * the reconciled list, where the coded `drugId` is the analysable form and the patient-reported
 * name is excluded as free text.
 */
const MEDICATION_ADHERENCE_HEADERS = [
  'research_adherence_key',
  'research_encounter_key',
  'research_patient_key',
  'research_clinic_key',
  'research_medication_record_key',
  'research_observed_revision_key',
  'context',
  'took_today',
  'doses_missed_7d',
  'taking_as_prescribed',
  'supply_remaining',
  'problems',
  'recorded_at',
];

const MEASUREMENT_HEADERS = [
  'research_measurement_key',
  'research_patient_key',
  'research_clinic_key',
  'recorded_at',
  'source',
  'source_schema',
  'type',
  'systolic_bp',
  'diastolic_bp',
  'pulse',
  'glucose_mg_dl',
  'glucose_type',
  'weight_kg',
  'research_linked_encounter_key',
];

const APPOINTMENT_HEADERS = [
  'research_request_key',
  'research_appointment_key',
  'research_patient_key',
  'research_clinic_key',
  'request_created_at',
  'preferred_start_date',
  'preferred_end_date',
  'request_status',
  'triaged_at',
  'confirmed_starts_at',
  'confirmed_ends_at',
  'appointment_status',
  'has_assigned_doctor',
  'has_assigned_volunteer',
];

const REVOCATION_HEADERS = ['research_patient_key', 'research_clinic_key', 'revoked_at', 'status'];

const MEDICAL_HISTORY_HEADERS = [
  'research_history_revision_key',
  'research_history_record_key',
  'research_patient_key',
  'research_clinic_key',
  'research_source_encounter_key',
  'category',
  'status',
  'onset_date',
  'occurrence_date',
  'resolved_date',
  'revision_number',
  'details_schema_version',
  'allergy_kind',
  'allergy_severity',
  'social_history_type',
  'recorded_at',
];

interface TransformContext {
  clinicId: string;
  fromDate: string;
  toDate: string;
  exportId: string;
  generatedAt: Date;
  clinicKey: string;
}

@Injectable()
export class ResearchTransformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deIdService: DeIdentificationService,
  ) {}

  async generatePack(
    clinicId: string,
    fromDate: string,
    toDate: string,
    exportId: string,
    policyVersion = RESEARCH_POLICY_VERSION,
  ): Promise<GeneratedResearchPack> {
    const { start, end } = this.getWindow(fromDate, toDate);
    const generatedAt = new Date();
    const clinicKey = this.deIdService.clinicKey(clinicId);
    const ctx: TransformContext = {
      clinicId,
      fromDate,
      toDate,
      exportId,
      generatedAt,
      clinicKey,
    };

    const [activeConsents, previousCompletedExport] = await Promise.all([
      this.prisma.patientConsent.findMany({
        where: {
          clinicId,
          consentType: 'RESEARCH_DEIDENTIFIED',
          status: 'GRANTED',
        },
        orderBy: [{ grantedAt: 'desc' }],
      }),
      this.prisma.researchExport.findFirst({
        where: {
          clinicId,
          status: 'COMPLETED',
          id: { not: exportId },
        },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const consentByPatientId = new Map<string, (typeof activeConsents)[number]>();
    for (const consent of activeConsents) {
      if (!consentByPatientId.has(consent.patientId)) {
        consentByPatientId.set(consent.patientId, consent);
      }
    }

    const consentedPatientIds = [...consentByPatientId.keys()];

    const [
      checkIns,
      assignments,
      encounters,
      measurements,
      legacySelfReports,
      appointmentRequests,
      revokedConsents,
      medicalHistoryRevisions,
      medicationAdherence,
    ] = await Promise.all([
      consentedPatientIds.length === 0
        ? Promise.resolve([])
        : this.prisma.patientCheckIn.findMany({
            where: {
              clinicId,
              patientId: { in: consentedPatientIds },
              checkedInAt: { gte: start, lte: end },
            },
            orderBy: [{ checkedInAt: 'asc' }, { id: 'asc' }],
          }),
      consentedPatientIds.length === 0
        ? Promise.resolve([])
        : this.prisma.patientAssignment.findMany({
            where: {
              clinicId,
              patientCheckIn: {
                patientId: { in: consentedPatientIds },
              },
              assignedAt: { gte: start, lte: end },
            },
            include: {
              patientCheckIn: {
                select: {
                  id: true,
                  patientId: true,
                },
              },
            },
            orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
          }),
      consentedPatientIds.length === 0
        ? Promise.resolve([])
        : this.prisma.encounter.findMany({
            where: {
              clinicId,
              patientId: { in: consentedPatientIds },
              createdAt: { gte: start, lte: end },
            },
            include: {
              vitals: true,
              tobaccoScreening: true,
              diabetesScreening: true,
              /*
                Selected, not included whole.

                The export's headers are a fixed list, so widening this record never leaked by
                itself -- but the guided interview (#114) grew it from four columns to sixty-seven,
                including the supervising clinician's free-text comments, and `true` pulled all of
                them into the export process. Naming the columns the transform actually reads means
                adding a header is the only way to export a new field, which is the decision the
                research registry exists to force.

                Every name here is `EXPORTED` or `COARSENED` in
                `research-field-registry.ts`, under `HypertensionAssessment`. The supervising
                clinician's free text and the JSONB sections are absent because the registry
                excludes them.
              */
              hypertensionAssessment: {
                select: {
                  createdAt: true,
                  collectedAt: true,
                  classification: true,
                  derivedClassification: true,
                  classificationOverridden: true,
                  suspected: true,
                  confirmed: true,
                  hypertensionStatus: true,
                  yearDiagnosed: true,
                  yearDiagnosedUnknown: true,
                  mainConcern: true,
                  usualCareFacilityStatus: true,
                  repeatPerformed: true,
                  repeatSystolicBp: true,
                  repeatDiastolicBp: true,
                  repeatPosition: true,
                  repeatCuffSize: true,
                  repeatMeasuredAt: true,
                  repeatPromptShown: true,
                  homeMonitorStatus: true,
                  homeCheckFrequency: true,
                  homeSystolicAvg: true,
                  homeDiastolicAvg: true,
                  homeReadingsUnknown: true,
                  homeReadingSource: true,
                  currentSymptoms: true,
                  urgentReviewRequired: true,
                  urgentReviewReasons: true,
                  medicationReminderStrategies: true,
                  contributingSubstances: true,
                  relevantConditions: true,
                  pregnantNow: true,
                  planningPregnancy: true,
                  kidneyFunctionTesting: true,
                  urineProteinTesting: true,
                  cholesterolTesting: true,
                  ecgCompleted: true,
                  statinUse: true,
                  aspirinUse: true,
                  clinicianReviewRequested: true,
                  reviewReasons: true,
                  bpGoalSystolic: true,
                  bpGoalDiastolic: true,
                  followUpWindow: true,
                  followUpOwner: true,
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
      consentedPatientIds.length === 0
        ? Promise.resolve([])
        : this.prisma.patientMeasurement.findMany({
            where: {
              clinicId,
              patientId: { in: consentedPatientIds },
              recordedAt: { gte: start, lte: end },
            },
            orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
          }),
      consentedPatientIds.length === 0
        ? Promise.resolve([])
        : this.prisma.patientSelfReport.findMany({
            where: {
              clinicId,
              patientId: { in: consentedPatientIds },
              recordedAt: { gte: start, lte: end },
              type: { in: ['HOME_BP', 'HOME_GLUCOSE'] },
            },
            orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
          }),
      consentedPatientIds.length === 0
        ? Promise.resolve([])
        : this.prisma.appointmentRequest.findMany({
            where: {
              clinicId,
              patientId: { in: consentedPatientIds },
              OR: [
                { createdAt: { gte: start, lte: end } },
                { triagedAt: { gte: start, lte: end } },
                {
                  appointment: {
                    startsAt: { gte: start, lte: end },
                  },
                },
              ],
            },
            include: {
              appointment: true,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
      this.prisma.patientConsent.findMany({
        where: {
          clinicId,
          consentType: 'RESEARCH_DEIDENTIFIED',
          status: 'REVOKED',
          revokedAt: {
            gt: previousCompletedExport?.completedAt ?? new Date(0),
            lte: generatedAt,
          },
        },
        orderBy: [{ revokedAt: 'asc' }, { id: 'asc' }],
      }),
      consentedPatientIds.length === 0
        ? Promise.resolve([])
        : this.prisma.medicalHistoryRevision.findMany({
            where: {
              record: {
                clinicId,
                patientId: { in: consentedPatientIds },
              },
              createdAt: { gte: start, lte: end },
            },
            include: {
              record: {
                select: {
                  id: true,
                  patientId: true,
                  category: true,
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
      /*
        Selected, not included whole, for the reason given on the hypertension record above.

        `encounter` is joined only for its `patientId`: the row is scoped to the clinic and the
        research file needs the subject key, and reading the patient from the encounter is what
        keeps this query from having to trust an id on the adherence row itself.
      */
      consentedPatientIds.length === 0
        ? Promise.resolve([])
        : this.prisma.encounterMedicationAdherence.findMany({
            where: {
              clinicId,
              encounter: { patientId: { in: consentedPatientIds } },
              createdAt: { gte: start, lte: end },
            },
            select: {
              id: true,
              encounterId: true,
              context: true,
              medicationRecordId: true,
              observedRevisionId: true,
              tookToday: true,
              dosesMissed7d: true,
              takingAsPrescribed: true,
              supplyRemaining: true,
              problems: true,
              createdAt: true,
              encounter: { select: { patientId: true } },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
    ]);

    const referencedPatientIds = new Set<string>();
    for (const patientId of consentedPatientIds) {
      referencedPatientIds.add(patientId);
    }
    for (const row of revokedConsents) {
      referencedPatientIds.add(row.patientId);
    }
    for (const row of checkIns) {
      referencedPatientIds.add(row.patientId);
    }
    for (const row of measurements) {
      referencedPatientIds.add(row.patientId);
    }
    for (const row of legacySelfReports) {
      referencedPatientIds.add(row.patientId);
    }
    for (const row of appointmentRequests) {
      referencedPatientIds.add(row.patientId);
    }
    for (const row of encounters) {
      referencedPatientIds.add(row.patientId);
    }
    for (const row of assignments) {
      referencedPatientIds.add(row.patientCheckIn.patientId);
    }
    for (const row of medicalHistoryRevisions) {
      referencedPatientIds.add(row.record.patientId);
    }

    const patients =
      referencedPatientIds.size === 0
        ? []
        : await this.prisma.patient.findMany({
            where: {
              id: { in: [...referencedPatientIds] },
            },
            select: {
              id: true,
              dob: true,
              sex: true,
              residentialLocationStatus: true,
              residentialRegion: true,
            },
          });

    const patientMap = new Map(patients.map((patient) => [patient.id, patient]));

    const subjectRows = [...referencedPatientIds].sort().map((patientId) => {
      const patient = patientMap.get(patientId);
      const currentConsent = consentByPatientId.get(patientId);
      const latestRevocation = revokedConsents
        .filter((consent) => consent.patientId === patientId)
        .sort((a, b) => b.revokedAt!.getTime() - a.revokedAt!.getTime())[0];

      return {
        research_patient_key: this.deIdService.patientKey(clinicId, patientId),
        research_clinic_key: clinicKey,
        sex: patient?.sex ?? 'UNKNOWN',
        birth_year: this.deIdService.birthYear(patient?.dob ?? null),
        // Region only, and only when deliberately recorded.
        residential_region:
          patient?.residentialLocationStatus === 'RECORDED' && patient.residentialRegion
            ? patient.residentialRegion
            : '',
        latest_consent_status: currentConsent
          ? 'GRANTED'
          : latestRevocation
            ? 'REVOKED'
            : 'UNKNOWN',
      };
    });

    const checkInRows = checkIns.map((checkIn) => ({
      research_checkin_key: this.deIdService.entityKey(clinicId, 'checkin', checkIn.id),
      research_patient_key: this.deIdService.patientKey(clinicId, checkIn.patientId),
      research_clinic_key: clinicKey,
      checked_in_at: this.deIdService.roundTimestamp(checkIn.checkedInAt),
      source: checkIn.source,
      status: checkIn.status,
      research_encounter_key: this.deIdService.entityKey(
        clinicId,
        'encounter',
        checkIn.encounterId,
      ),
    }));

    const assignmentRows = assignments.map((assignment) => ({
      research_assignment_key: this.deIdService.entityKey(clinicId, 'assignment', assignment.id),
      research_checkin_key: this.deIdService.entityKey(
        clinicId,
        'checkin',
        assignment.patientCheckInId,
      ),
      research_patient_key: this.deIdService.patientKey(
        clinicId,
        assignment.patientCheckIn.patientId,
      ),
      research_clinic_key: clinicKey,
      assigned_at: this.deIdService.roundTimestamp(assignment.assignedAt),
      status: assignment.status,
      assigned_volunteer_role: 'VOLUNTEER',
      assigned_doctor_role: 'DOCTOR',
    }));

    const vitalsRows = encounters
      .filter((encounter) => encounter.vitals !== null)
      .map((encounter) => ({
        research_encounter_key: this.deIdService.entityKey(clinicId, 'encounter', encounter.id),
        research_patient_key: this.deIdService.patientKey(clinicId, encounter.patientId),
        research_clinic_key: clinicKey,
        encounter_status: encounter.status,
        encounter_created_at: this.deIdService.roundTimestamp(encounter.createdAt),
        recorded_at: this.deIdService.roundTimestamp(encounter.vitals?.createdAt ?? null),
        systolic_bp: encounter.vitals?.systolicBp ?? null,
        diastolic_bp: encounter.vitals?.diastolicBp ?? null,
        bp_site: encounter.vitals?.bpSite ?? null,
        patient_position: encounter.vitals?.patientPosition ?? null,
        cuff_size: encounter.vitals?.cuffSize ?? null,
        pulse_bpm: encounter.vitals?.pulseBpm ?? null,
        temperature_celsius: encounter.vitals?.temperatureCelsius ?? null,
        temperature_source: encounter.vitals?.temperatureSource ?? null,
        respiratory_rate: encounter.vitals?.respiratoryRate ?? null,
        spo2_percent: encounter.vitals?.spo2Percent ?? null,
        weight_kg: encounter.vitals?.weightKg ?? null,
        height_cm: encounter.vitals?.heightCm ?? null,
        bmi: encounter.vitals?.bmi ?? null,
      }));

    const tobaccoRows = encounters
      .filter((encounter) => encounter.tobaccoScreening != null)
      .map((encounter) => ({
        research_encounter_key: this.deIdService.entityKey(clinicId, 'encounter', encounter.id),
        research_patient_key: this.deIdService.patientKey(clinicId, encounter.patientId),
        research_clinic_key: clinicKey,
        encounter_status: encounter.status,
        encounter_created_at: this.deIdService.roundTimestamp(encounter.createdAt),
        recorded_at: this.deIdService.roundTimestamp(encounter.tobaccoScreening?.createdAt ?? null),
        smoking_status: encounter.tobaccoScreening?.smokingStatus ?? null,
        smokeless_tobacco_status: encounter.tobaccoScreening?.smokelessTobaccoStatus ?? null,
        passive_exposure: encounter.tobaccoScreening?.passiveExposure ?? null,
        readiness_to_quit: encounter.tobaccoScreening?.readinessToQuit ?? null,
        counseling_given: encounter.tobaccoScreening?.counselingGiven ?? null,
        reviewed: encounter.tobaccoScreening?.reviewedAt != null,
        reviewed_at: this.deIdService.roundTimestamp(
          encounter.tobaccoScreening?.reviewedAt ?? null,
        ),
      }));

    const screeningRows = encounters
      .filter(
        (encounter) =>
          encounter.diabetesScreening !== null || encounter.hypertensionAssessment !== null,
      )
      .map((encounter) => ({
        research_encounter_key: this.deIdService.entityKey(clinicId, 'encounter', encounter.id),
        research_patient_key: this.deIdService.patientKey(clinicId, encounter.patientId),
        research_clinic_key: clinicKey,
        encounter_status: encounter.status,
        encounter_created_at: this.deIdService.roundTimestamp(encounter.createdAt),
        recorded_at: this.deIdService.roundTimestamp(
          encounter.diabetesScreening?.collectedAt ??
            encounter.hypertensionAssessment?.createdAt ??
            null,
        ),
        glucose_mg_dl: encounter.diabetesScreening?.glucoseMgDl ?? null,
        glucose_type: encounter.diabetesScreening?.glucoseType ?? null,
        hba1c_percent: encounter.diabetesScreening?.hba1cPercent ?? null,
        ...this.serializeHypertensionColumns(encounter.hypertensionAssessment),
      }));

    const adherenceRows = medicationAdherence.map((row) => ({
      research_adherence_key: this.deIdService.entityKey(clinicId, 'medication_adherence', row.id),
      research_encounter_key: this.deIdService.entityKey(clinicId, 'encounter', row.encounterId),
      research_patient_key: this.deIdService.patientKey(clinicId, row.encounter.patientId),
      research_clinic_key: clinicKey,
      research_medication_record_key: this.deIdService.entityKey(
        clinicId,
        'patient_medication_record',
        row.medicationRecordId,
      ),
      research_observed_revision_key: this.deIdService.entityKey(
        clinicId,
        'patient_medication_revision',
        row.observedRevisionId,
      ),
      context: row.context,
      took_today: row.tookToday,
      doses_missed_7d: row.dosesMissed7d,
      taking_as_prescribed: row.takingAsPrescribed,
      supply_remaining: row.supplyRemaining,
      problems: row.problems.join('|'),
      recorded_at: this.deIdService.roundTimestamp(row.createdAt),
    }));

    const measurementRows = [
      ...measurements.map((measurement) =>
        this.serializeMeasurementRow(ctx, {
          type: measurement.type,
          source: measurement.source,
          sourceSchema: 'PATIENT_MEASUREMENT',
          id: measurement.id,
          patientId: measurement.patientId,
          recordedAt: measurement.recordedAt,
          linkedEncounterId: measurement.linkedEncounterId,
          payloadJson: measurement.payloadJson,
        }),
      ),
      ...legacySelfReports
        .map((report) => this.serializeLegacySelfReportRow(ctx, report))
        .filter((row): row is Record<string, unknown> => row !== null),
    ];

    const appointmentRows = appointmentRequests.map((request) => ({
      research_request_key: this.deIdService.entityKey(clinicId, 'appointment_request', request.id),
      research_appointment_key: this.deIdService.entityKey(
        clinicId,
        'appointment',
        request.appointment?.id,
      ),
      research_patient_key: this.deIdService.patientKey(clinicId, request.patientId),
      research_clinic_key: clinicKey,
      request_created_at: this.deIdService.roundTimestamp(request.createdAt),
      preferred_start_date: this.deIdService.formatDate(request.preferredStartDate),
      preferred_end_date: this.deIdService.formatDate(request.preferredEndDate),
      request_status: request.status,
      triaged_at: this.deIdService.roundTimestamp(request.triagedAt),
      confirmed_starts_at: this.deIdService.roundTimestamp(request.appointment?.startsAt ?? null),
      confirmed_ends_at: this.deIdService.roundTimestamp(request.appointment?.endsAt ?? null),
      appointment_status: request.appointment?.status ?? null,
      has_assigned_doctor: request.appointment?.assignedDoctorId ? true : false,
      has_assigned_volunteer: request.appointment?.assignedVolunteerId ? true : false,
    }));

    const revocationRows = revokedConsents.map((consent) => ({
      research_patient_key: this.deIdService.patientKey(clinicId, consent.patientId),
      research_clinic_key: clinicKey,
      revoked_at: this.deIdService.roundTimestamp(consent.revokedAt),
      status: 'REVOKED',
    }));

    const medicalHistoryRows = medicalHistoryRevisions.map((revision) => {
      const details =
        revision.details && typeof revision.details === 'object' && !Array.isArray(revision.details)
          ? (revision.details as Record<string, unknown>)
          : {};
      return {
        research_history_revision_key: this.deIdService.entityKey(
          clinicId,
          'medical_history_revision',
          revision.id,
        ),
        research_history_record_key: this.deIdService.entityKey(
          clinicId,
          'medical_history_record',
          revision.record.id,
        ),
        research_patient_key: this.deIdService.patientKey(clinicId, revision.record.patientId),
        research_clinic_key: clinicKey,
        research_source_encounter_key: this.deIdService.entityKey(
          clinicId,
          'encounter',
          revision.sourceEncounterId,
        ),
        category: revision.record.category,
        status: revision.status,
        onset_date: this.deIdService.formatDate(revision.onsetDate),
        occurrence_date: this.deIdService.formatDate(revision.occurrenceDate),
        resolved_date: this.deIdService.formatDate(revision.resolvedDate),
        revision_number: revision.revisionNumber,
        details_schema_version: revision.detailsSchemaVersion,
        allergy_kind:
          revision.record.category === 'ALLERGY'
            ? (this.deIdService.stringFromUnknown(details.kind) ?? null)
            : null,
        allergy_severity:
          revision.record.category === 'ALLERGY'
            ? (this.deIdService.stringFromUnknown(details.severity) ?? 'UNKNOWN')
            : null,
        social_history_type:
          revision.record.category === 'SOCIAL_HISTORY'
            ? (this.deIdService.stringFromUnknown(details.socialType) ?? null)
            : null,
        recorded_at: this.deIdService.roundTimestamp(revision.createdAt),
      };
    });

    const csvFiles = [
      this.createCsvFile('research_subjects.csv', SUBJECT_HEADERS, subjectRows),
      this.createCsvFile('research_ops_checkins.csv', CHECKIN_HEADERS, checkInRows),
      this.createCsvFile('research_ops_assignments.csv', ASSIGNMENT_HEADERS, assignmentRows),
      this.createCsvFile('research_clinical_vitals.csv', VITALS_HEADERS, vitalsRows),
      this.createCsvFile('research_clinical_tobacco.csv', TOBACCO_HEADERS, tobaccoRows),
      this.createCsvFile('research_clinical_screenings.csv', SCREENING_HEADERS, screeningRows),
      this.createCsvFile(
        'research_medication_adherence.csv',
        MEDICATION_ADHERENCE_HEADERS,
        adherenceRows,
      ),
      this.createCsvFile('research_measurements.csv', MEASUREMENT_HEADERS, measurementRows),
      this.createCsvFile('research_appointments.csv', APPOINTMENT_HEADERS, appointmentRows),
      this.createCsvFile(
        'research_medical_history.csv',
        MEDICAL_HISTORY_HEADERS,
        medicalHistoryRows,
      ),
      this.createCsvFile('research_revocations.csv', REVOCATION_HEADERS, revocationRows),
    ];

    const rowCounts: Record<string, number> = Object.fromEntries(
      csvFiles.map((file) => [file.file.name.replace('.csv', ''), file.rows]),
    );

    const manifestBase = {
      exportId,
      clinicKey,
      datasetVersion: RESEARCH_DATASET_VERSION,
      policyVersion,
      fromDate,
      toDate,
      generatedAt: generatedAt.toISOString(),
      timestampRoundingMinutes: 15,
      rowCounts,
      files: csvFiles.map((file) => ({
        name: file.file.name,
        bytes: file.file.bytes,
        sha256: file.file.sha256,
        rows: file.rows,
      })),
    };

    const manifestContent = `${JSON.stringify(manifestBase, null, 2)}\n`;
    const manifestFile = this.toPackFile('manifest.json', manifestContent);
    const checksumsContent =
      [...csvFiles.map((file) => file.file), manifestFile]
        .map((file) => `${file.sha256}  ${file.name}`)
        .join('\n') + '\n';
    const checksumFile = this.toPackFile('SHA256SUMS.txt', checksumsContent);

    const repoFiles = [...csvFiles.map((file) => file.file), manifestFile, checksumFile];

    const artifactDir = path.join(this.getExportDir(), exportId);
    fs.mkdirSync(artifactDir, { recursive: true });

    const zipBuffer = createStoredZip(
      repoFiles.map((file) => ({
        name: file.name,
        content: Buffer.from(file.content, 'utf-8'),
      })),
      generatedAt,
    );

    const artifactPath = path.join(
      artifactDir,
      `research-export-${exportId}.${RESEARCH_FILE_FORMAT}`,
    );
    fs.writeFileSync(artifactPath, zipBuffer);

    this.cleanupArtifacts(artifactDir);

    return {
      manifest: {
        ...manifestBase,
        files: [
          ...manifestBase.files,
          {
            name: 'manifest.json',
            bytes: manifestFile.bytes,
            sha256: manifestFile.sha256,
          },
        ],
      },
      repoFiles,
      artifactPath,
      artifactSha256: sha256Hex(zipBuffer),
      artifactSizeBytes: zipBuffer.length,
      recordCount: Object.values(rowCounts).reduce<number>((sum, value) => sum + value, 0),
      rowCounts,
    };
  }

  /**
   * The hypertension half of a screenings row.
   *
   * Extracted because it is forty columns and the row it belongs to also carries diabetes; inline,
   * a reader could not see where one condition ended and the other began. Every column is named in
   * the registry -- arrays are pipe-joined rather than JSON-encoded so a spreadsheet can read them,
   * and the two timestamps go through the same rounding as every other date in the pack.
   */
  private serializeHypertensionColumns(
    /*
      Called `row` rather than anything more descriptive.

      `clinical-note-non-exposure.spec.ts` scans every source file under `src/research` for the
      three column names a clinical note is stored in, word-bounded, and fails on any of them. Note
      content is server-only by policy, and a mechanical scan is what keeps that boundary from
      depending on everyone remembering it -- including here, where the obvious name for this
      parameter is one of the three.
    */
    row: {
      classification: string;
      derivedClassification: string;
      classificationOverridden: boolean;
      suspected: boolean;
      confirmed: boolean;
      hypertensionStatus: string;
      yearDiagnosed: number | null;
      yearDiagnosedUnknown: boolean;
      mainConcern: string;
      usualCareFacilityStatus: string;
      repeatPerformed: string;
      repeatSystolicBp: number | null;
      repeatDiastolicBp: number | null;
      repeatPosition: string | null;
      repeatCuffSize: string | null;
      repeatMeasuredAt: Date | null;
      repeatPromptShown: boolean;
      homeMonitorStatus: string;
      homeCheckFrequency: string;
      homeSystolicAvg: number | null;
      homeDiastolicAvg: number | null;
      homeReadingsUnknown: boolean;
      homeReadingSource: string;
      currentSymptoms: string[];
      urgentReviewRequired: boolean;
      urgentReviewReasons: string[];
      medicationReminderStrategies: string[];
      contributingSubstances: string[];
      relevantConditions: string[];
      pregnantNow: string;
      planningPregnancy: string;
      kidneyFunctionTesting: string;
      urineProteinTesting: string;
      cholesterolTesting: string;
      ecgCompleted: string;
      statinUse: string;
      aspirinUse: string;
      clinicianReviewRequested: boolean;
      reviewReasons: string[];
      bpGoalSystolic: number | null;
      bpGoalDiastolic: number | null;
      followUpWindow: string;
      followUpOwner: string;
      collectedAt: Date;
    } | null,
  ): Record<string, unknown> {
    const a = row;
    return {
      hypertension_classification: a?.classification ?? null,
      hypertension_derived_classification: a?.derivedClassification ?? null,
      hypertension_classification_overridden: a?.classificationOverridden ?? null,
      hypertension_suspected: a?.suspected ?? null,
      hypertension_confirmed: a?.confirmed ?? null,
      hypertension_status: a?.hypertensionStatus ?? null,
      hypertension_year_diagnosed: this.deIdService.yearBand(a?.yearDiagnosed ?? null),
      hypertension_year_diagnosed_unknown: a?.yearDiagnosedUnknown ?? null,
      hypertension_main_concern: a?.mainConcern ?? null,
      hypertension_usual_care_facility_status: a?.usualCareFacilityStatus ?? null,
      hypertension_repeat_performed: a?.repeatPerformed ?? null,
      hypertension_repeat_systolic_bp: a?.repeatSystolicBp ?? null,
      hypertension_repeat_diastolic_bp: a?.repeatDiastolicBp ?? null,
      hypertension_repeat_position: a?.repeatPosition ?? null,
      hypertension_repeat_cuff_size: a?.repeatCuffSize ?? null,
      hypertension_repeat_measured_at: this.deIdService.roundTimestamp(a?.repeatMeasuredAt ?? null),
      hypertension_repeat_prompt_shown: a?.repeatPromptShown ?? null,
      hypertension_home_monitor_status: a?.homeMonitorStatus ?? null,
      hypertension_home_check_frequency: a?.homeCheckFrequency ?? null,
      hypertension_home_systolic_avg: a?.homeSystolicAvg ?? null,
      hypertension_home_diastolic_avg: a?.homeDiastolicAvg ?? null,
      hypertension_home_readings_unknown: a?.homeReadingsUnknown ?? null,
      hypertension_home_reading_source: a?.homeReadingSource ?? null,
      hypertension_current_symptoms: a ? a.currentSymptoms.join('|') : null,
      hypertension_urgent_review_required: a?.urgentReviewRequired ?? null,
      hypertension_urgent_review_reasons: a ? a.urgentReviewReasons.join('|') : null,
      hypertension_medication_reminder_strategies: a
        ? a.medicationReminderStrategies.join('|')
        : null,
      hypertension_contributing_substances: a ? a.contributingSubstances.join('|') : null,
      hypertension_relevant_conditions: a ? a.relevantConditions.join('|') : null,
      hypertension_pregnant_now: a?.pregnantNow ?? null,
      hypertension_planning_pregnancy: a?.planningPregnancy ?? null,
      hypertension_kidney_function_testing: a?.kidneyFunctionTesting ?? null,
      hypertension_urine_protein_testing: a?.urineProteinTesting ?? null,
      hypertension_cholesterol_testing: a?.cholesterolTesting ?? null,
      hypertension_ecg_completed: a?.ecgCompleted ?? null,
      hypertension_statin_use: a?.statinUse ?? null,
      hypertension_aspirin_use: a?.aspirinUse ?? null,
      hypertension_clinician_review_requested: a?.clinicianReviewRequested ?? null,
      hypertension_review_reasons: a ? a.reviewReasons.join('|') : null,
      hypertension_bp_goal_systolic: a?.bpGoalSystolic ?? null,
      hypertension_bp_goal_diastolic: a?.bpGoalDiastolic ?? null,
      hypertension_follow_up_window: a?.followUpWindow ?? null,
      hypertension_follow_up_owner: a?.followUpOwner ?? null,
      hypertension_collected_at: this.deIdService.roundTimestamp(a?.collectedAt ?? null),
    };
  }

  private serializeMeasurementRow(
    ctx: TransformContext,
    input: {
      id: string;
      patientId: string;
      type: string;
      source: string;
      sourceSchema: string;
      recordedAt: Date;
      linkedEncounterId: string | null;
      payloadJson: string;
    },
  ): Record<string, unknown> {
    const payload = this.deIdService.parseJsonObject(input.payloadJson);
    const systolic =
      this.deIdService.numberFromUnknown(payload.systolicBp) ??
      this.deIdService.numberFromUnknown(payload.systolic);
    const diastolic =
      this.deIdService.numberFromUnknown(payload.diastolicBp) ??
      this.deIdService.numberFromUnknown(payload.diastolic);
    const pulse =
      this.deIdService.numberFromUnknown(payload.pulse) ??
      this.deIdService.numberFromUnknown(payload.heartRate);
    const glucose =
      this.deIdService.numberFromUnknown(payload.glucoseMgDl) ??
      this.deIdService.numberFromUnknown(payload.value);
    const glucoseType =
      this.deIdService.stringFromUnknown(payload.glucoseType) ??
      this.deIdService.stringFromUnknown(payload.type);
    const weight =
      this.deIdService.numberFromUnknown(payload.weightKg) ??
      this.deIdService.numberFromUnknown(payload.kg) ??
      (input.type === 'WEIGHT' ? this.deIdService.numberFromUnknown(payload.value) : null);

    return {
      research_measurement_key: this.deIdService.entityKey(ctx.clinicId, 'measurement', input.id),
      research_patient_key: this.deIdService.patientKey(ctx.clinicId, input.patientId),
      research_clinic_key: ctx.clinicKey,
      recorded_at: this.deIdService.roundTimestamp(input.recordedAt),
      source: input.source,
      source_schema: input.sourceSchema,
      type: input.type,
      systolic_bp: systolic,
      diastolic_bp: diastolic,
      pulse,
      glucose_mg_dl: glucose,
      glucose_type: glucoseType,
      weight_kg: weight,
      research_linked_encounter_key: this.deIdService.entityKey(
        ctx.clinicId,
        'encounter',
        input.linkedEncounterId,
      ),
    };
  }

  private serializeLegacySelfReportRow(
    ctx: TransformContext,
    report: {
      id: string;
      patientId: string;
      type: string;
      recordedAt: Date;
      systolicBp: number | null;
      diastolicBp: number | null;
      glucoseMgDl: number | null;
      glucoseType: string | null;
    },
  ): Record<string, unknown> | null {
    if (report.type !== 'HOME_BP' && report.type !== 'HOME_GLUCOSE') {
      return null;
    }

    return {
      research_measurement_key: this.deIdService.entityKey(
        ctx.clinicId,
        'legacy_self_report',
        report.id,
      ),
      research_patient_key: this.deIdService.patientKey(ctx.clinicId, report.patientId),
      research_clinic_key: ctx.clinicKey,
      recorded_at: this.deIdService.roundTimestamp(report.recordedAt),
      source: 'PATIENT',
      source_schema: 'PATIENT_SELF_REPORT',
      type: report.type === 'HOME_BP' ? 'BP' : 'GLUCOSE',
      systolic_bp: report.type === 'HOME_BP' ? report.systolicBp : null,
      diastolic_bp: report.type === 'HOME_BP' ? report.diastolicBp : null,
      pulse: null,
      glucose_mg_dl: report.type === 'HOME_GLUCOSE' ? report.glucoseMgDl : null,
      glucose_type: report.type === 'HOME_GLUCOSE' ? report.glucoseType : null,
      weight_kg: null,
      research_linked_encounter_key: '',
    };
  }

  private createCsvFile(name: string, headers: string[], rows: Array<Record<string, unknown>>) {
    const content = `${this.deIdService.csvFromRows(headers, rows)}\n`;
    return {
      rows: rows.length,
      file: this.toPackFile(name, content),
    };
  }

  private toPackFile(name: string, content: string): ResearchPackFile {
    return {
      name,
      content,
      bytes: Buffer.byteLength(content, 'utf-8'),
      sha256: sha256Hex(content),
    };
  }

  private getWindow(fromDate: string, toDate: string) {
    const start = new Date(`${fromDate}T00:00:00.000Z`);
    const end = new Date(`${toDate}T23:59:59.999Z`);
    return { start, end };
  }

  private getExportDir() {
    return process.env.RESEARCH_EXPORT_DIR?.trim() || DEFAULT_EXPORT_DIR;
  }

  private cleanupArtifacts(currentArtifactDir: string) {
    const exportDir = this.getExportDir();
    const retentionDays = Number(
      process.env.RESEARCH_EXPORT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS,
    );
    const ttlMs =
      (Number.isFinite(retentionDays) ? retentionDays : DEFAULT_RETENTION_DAYS) *
      24 *
      60 *
      60 *
      1000;
    const cutoff = Date.now() - ttlMs;

    if (!fs.existsSync(exportDir)) {
      return;
    }

    for (const entry of fs.readdirSync(exportDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidateDir = path.join(exportDir, entry.name);
      if (candidateDir === currentArtifactDir) {
        continue;
      }
      const stat = fs.statSync(candidateDir);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(candidateDir, { recursive: true, force: true });
      }
    }
  }
}
