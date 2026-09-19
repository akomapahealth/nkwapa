import * as fs from 'fs';
import * as path from 'path';
import { DeIdentificationService } from './de-identification.service';
import { ResearchTransformService } from './research-transform.service';

describe('ResearchTransformService', () => {
  const exportDir = path.join(__dirname, '__research_export_artifacts__');

  let prisma: {
    patientConsent: { findMany: jest.Mock };
    researchExport: { findFirst: jest.Mock };
    patientCheckIn: { findMany: jest.Mock };
    patientAssignment: { findMany: jest.Mock };
    encounter: { findMany: jest.Mock };
    patientMeasurement: { findMany: jest.Mock };
    patientSelfReport: { findMany: jest.Mock };
    appointmentRequest: { findMany: jest.Mock };
    patient: { findMany: jest.Mock };
    medicalHistoryRevision: { findMany: jest.Mock };
    encounterMedicationAdherence: { findMany: jest.Mock };
  };
  let service: ResearchTransformService;

  beforeEach(() => {
    process.env.RESEARCH_HMAC_KEY = 'transform-test-key';
    process.env.RESEARCH_EXPORT_DIR = exportDir;

    prisma = {
      patientConsent: { findMany: jest.fn() },
      researchExport: { findFirst: jest.fn() },
      patientCheckIn: { findMany: jest.fn() },
      patientAssignment: { findMany: jest.fn() },
      encounter: { findMany: jest.fn() },
      patientMeasurement: { findMany: jest.fn() },
      patientSelfReport: { findMany: jest.fn() },
      appointmentRequest: { findMany: jest.fn() },
      patient: { findMany: jest.fn() },
      medicalHistoryRevision: { findMany: jest.fn() },
      encounterMedicationAdherence: { findMany: jest.fn() },
    };

    service = new ResearchTransformService(prisma as never, new DeIdentificationService());
  });

  afterEach(() => {
    delete process.env.RESEARCH_HMAC_KEY;
    delete process.env.RESEARCH_EXPORT_DIR;
    if (fs.existsSync(exportDir)) {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('generates a fixed pack even when no patients are currently consented', async () => {
    prisma.patientConsent.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.researchExport.findFirst.mockResolvedValue(null);
    prisma.patient.findMany.mockResolvedValue([]);

    const result = await service.generatePack('clinic-1', '2026-03-01', '2026-03-21', 'exp-empty');

    expect(result.recordCount).toBe(0);
    expect(result.repoFiles.map((file) => file.name)).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'SHA256SUMS.txt',
        'research_subjects.csv',
        'research_medical_history.csv',
        'research_revocations.csv',
      ]),
    );
    expect(result.manifest.datasetVersion).toBe(5);
    expect(fs.existsSync(result.artifactPath)).toBe(true);
  });

  it('normalizes mixed data into the v2 research pack without leaking pii', async () => {
    prisma.patientConsent.findMany
      .mockResolvedValueOnce([
        {
          id: 'consent-1',
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          consentType: 'RESEARCH_DEIDENTIFIED',
          status: 'GRANTED',
          consentVersion: 'v1-en',
          consentTextSnapshot: 'Research consent',
          grantedAt: new Date('2026-03-01T10:00:00.000Z'),
          revokedAt: null,
          recordedByUserId: 'user-1',
          witnessName: 'Witness',
          witnessPhoneE164: '+2330000000',
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          updatedAt: new Date('2026-03-01T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'consent-2',
          patientId: 'patient-2',
          clinicId: 'clinic-1',
          consentType: 'RESEARCH_DEIDENTIFIED',
          status: 'REVOKED',
          consentVersion: 'v1-en',
          consentTextSnapshot: 'Research consent',
          grantedAt: new Date('2026-02-10T10:00:00.000Z'),
          revokedAt: new Date('2026-03-20T11:12:00.000Z'),
          recordedByUserId: 'user-1',
          witnessName: 'Witness',
          witnessPhoneE164: '+2330000000',
          createdAt: new Date('2026-02-10T10:00:00.000Z'),
          updatedAt: new Date('2026-03-20T11:12:00.000Z'),
        },
      ]);
    prisma.researchExport.findFirst.mockResolvedValue({
      completedAt: new Date('2026-03-10T00:00:00.000Z'),
    });
    prisma.patientCheckIn.findMany.mockResolvedValue([
      {
        id: 'checkin-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        checkedInAt: new Date('2026-03-18T08:07:00.000Z'),
        source: 'STAFF',
        status: 'ASSIGNED',
        encounterId: 'enc-1',
        notes: 'PII note should not leak',
        createdAt: new Date('2026-03-18T08:07:00.000Z'),
        updatedAt: new Date('2026-03-18T08:08:00.000Z'),
      },
    ]);
    prisma.patientAssignment.findMany.mockResolvedValue([
      {
        id: 'assign-1',
        clinicId: 'clinic-1',
        patientCheckInId: 'checkin-1',
        assignedVolunteerId: 'vol-1',
        assignedDoctorId: 'doc-1',
        assignedByUserId: 'mgr-1',
        assignedAt: new Date('2026-03-18T08:17:00.000Z'),
        status: 'ACTIVE',
        reason: 'Internal only',
        createdAt: new Date('2026-03-18T08:17:00.000Z'),
        updatedAt: new Date('2026-03-18T08:17:00.000Z'),
        patientCheckIn: {
          id: 'checkin-1',
          patientId: 'patient-1',
        },
      },
    ]);
    prisma.encounter.findMany.mockResolvedValue([
      {
        id: 'enc-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        status: 'FINALIZED',
        createdByUserId: 'vol-1',
        preceptorReviewedById: 'prec-1',
        doctorFinalizedById: 'doc-1',
        createdAt: new Date('2026-03-18T08:32:00.000Z'),
        updatedAt: new Date('2026-03-18T09:00:00.000Z'),
        vitals: {
          createdAt: new Date('2026-03-18T08:35:00.000Z'),
          systolicBp: 128,
          diastolicBp: 83,
          bpSite: 'LEFT_ARM',
          patientPosition: 'SITTING',
          cuffSize: 'ADULT',
          pulseBpm: 70,
          temperatureCelsius: 37,
          temperatureSource: 'ORAL',
          respiratoryRate: 16,
          spo2Percent: 98,
          weightKg: 72,
          heightCm: 174,
          bmi: 23.8,
        },
        tobaccoScreening: {
          createdAt: new Date('2026-03-18T08:40:00.000Z'),
          smokingStatus: 'NEVER',
          smokelessTobaccoStatus: 'NOT_ASSESSED',
          passiveExposure: 'NO',
          readinessToQuit: 'NOT_APPLICABLE',
          counselingGiven: 'NO',
          reviewedByUserId: 'doctor-private-id',
          reviewedAt: new Date('2026-03-18T08:45:00.000Z'),
        },
        diabetesScreening: {
          createdAt: new Date('2026-03-18T08:38:00.000Z'),
          collectedAt: new Date('2026-03-18T08:53:00.000Z'),
          glucoseMgDl: 96,
          glucoseType: 'FASTING',
          hba1cPercent: 5.4,
        },
        hypertensionAssessment: {
          createdAt: new Date('2026-03-18T08:39:00.000Z'),
          collectedAt: new Date('2026-03-18T08:39:00.000Z'),
          classification: 'STAGE2',
          derivedClassification: 'STAGE1',
          classificationOverridden: true,
          suspected: false,
          confirmed: true,
          hypertensionStatus: 'KNOWN_HYPERTENSION',
          yearDiagnosed: 2017,
          yearDiagnosedUnknown: false,
          mainConcern: 'HIGH_BP',
          usualCareFacilityStatus: 'KNOWN',
          repeatPerformed: 'PERFORMED',
          repeatSystolicBp: 148,
          repeatDiastolicBp: 92,
          repeatPosition: 'SEATED',
          repeatCuffSize: 'ADULT',
          repeatMeasuredAt: new Date('2026-03-18T08:44:00.000Z'),
          repeatPromptShown: true,
          homeMonitorStatus: 'HAS_ONE',
          homeCheckFrequency: 'WEEKLY',
          homeSystolicAvg: 139,
          homeDiastolicAvg: 88,
          homeReadingsUnknown: false,
          homeReadingSource: 'PATIENT_LOG',
          currentSymptoms: ['HEADACHE', 'BLURRED_VISION'],
          urgentReviewRequired: false,
          urgentReviewReasons: [],
          medicationReminderStrategies: ['PILLBOX'],
          contributingSubstances: ['NONE'],
          relevantConditions: ['DIABETES'],
          pregnantNow: 'NO',
          planningPregnancy: 'NO',
          kidneyFunctionTesting: 'COMPLETED',
          urineProteinTesting: 'NOT_COMPLETED',
          cholesterolTesting: 'COMPLETED',
          ecgCompleted: 'NOT_COMPLETED',
          statinUse: 'TAKING',
          aspirinUse: 'NOT_TAKING',
          clinicianReviewRequested: true,
          reviewReasons: ['UNCONTROLLED_BP'],
          bpGoalSystolic: 130,
          bpGoalDiastolic: 80,
          followUpWindow: 'WITHIN_1_MONTH',
          followUpOwner: 'AKOMAPA_TEAM',
        },
      },
    ]);
    prisma.patientMeasurement.findMany.mockResolvedValue([
      {
        id: 'measurement-1',
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        recordedAt: new Date('2026-03-19T14:08:00.000Z'),
        source: 'PATIENT',
        type: 'BP',
        payloadJson: JSON.stringify({
          systolic: 126,
          diastolic: 81,
          pulse: 68,
          note: 'Do not leak',
        }),
        notes: 'Also do not leak',
        linkedEncounterId: null,
        createdAt: new Date('2026-03-19T14:08:00.000Z'),
        updatedAt: new Date('2026-03-19T14:08:00.000Z'),
      },
    ]);
    prisma.patientSelfReport.findMany.mockResolvedValue([
      {
        id: 'self-report-1',
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        submittedByUserId: 'patient-user-1',
        type: 'HOME_GLUCOSE',
        systolicBp: null,
        diastolicBp: null,
        glucoseMgDl: 102,
        glucoseType: 'FASTING',
        symptomsJson: '{"pain":true}',
        notes: 'No free text export',
        recordedAt: new Date('2026-03-17T06:44:00.000Z'),
        createdAt: new Date('2026-03-17T06:44:00.000Z'),
      },
    ]);
    prisma.appointmentRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        preferredStartDate: new Date('2026-03-25T00:00:00.000Z'),
        preferredEndDate: new Date('2026-03-28T00:00:00.000Z'),
        reason: 'Should not leak',
        notes: 'Should not leak',
        status: 'CONFIRMED',
        triagedByUserId: 'mgr-1',
        triagedAt: new Date('2026-03-19T09:00:00.000Z'),
        rejectionReason: null,
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        updatedAt: new Date('2026-03-19T09:00:00.000Z'),
        appointment: {
          id: 'appointment-1',
          clinicId: 'clinic-1',
          patientId: 'patient-1',
          startsAt: new Date('2026-03-28T10:32:00.000Z'),
          endsAt: new Date('2026-03-28T11:00:00.000Z'),
          status: 'CONFIRMED',
          linkedRequestId: 'request-1',
          assignedDoctorId: 'doc-1',
          assignedVolunteerId: null,
          notes: 'Do not leak',
          createdAt: new Date('2026-03-19T09:00:00.000Z'),
          updatedAt: new Date('2026-03-19T09:00:00.000Z'),
        },
      },
    ]);
    prisma.patient.findMany.mockResolvedValue([
      {
        id: 'patient-1',
        dob: new Date('1990-05-15T00:00:00.000Z'),
        sex: 'MALE',
        residentialLocationStatus: 'RECORDED',
        residentialRegion: 'GREATER_ACCRA',
        residentialDistrict: 'Accra Metropolitan',
        residentialCommunity: 'SecretCommunityName',
        residentialAddressNote: 'SecretAddressNote',
      },
      {
        id: 'patient-2',
        dob: new Date('1982-01-10T00:00:00.000Z'),
        sex: 'FEMALE',
        residentialLocationStatus: 'UNKNOWN',
        residentialRegion: null,
      },
    ]);
    prisma.encounterMedicationAdherence.findMany.mockResolvedValue([
      {
        id: 'adherence-1',
        encounterId: 'enc-1',
        context: 'HYPERTENSION',
        medicationRecordId: 'medication-record-1',
        observedRevisionId: 'medication-revision-1',
        tookToday: 'YES',
        dosesMissed7d: 'TWO_TO_THREE',
        takingAsPrescribed: 'NOT_ASSESSED',
        supplyRemaining: 'LESS_THAN_ONE_WEEK',
        problems: ['COST', 'FORGETTING'],
        createdAt: new Date('2026-03-18T08:47:00.000Z'),
        encounter: { patientId: 'patient-1' },
      },
    ]);
    prisma.medicalHistoryRevision.findMany.mockResolvedValue([
      {
        id: 'history-revision-1',
        recordId: 'history-record-1',
        revisionNumber: 1,
        status: 'ACTIVE',
        onsetDate: new Date('2025-01-01T00:00:00.000Z'),
        occurrenceDate: null,
        resolvedDate: null,
        detailsSchemaVersion: 1,
        details: {
          kind: 'ALLERGY',
          substance: 'Penicillin',
          reaction: 'Private reaction text',
          severity: 'SEVERE',
        },
        notes: 'Private clinical note',
        sourceEncounterId: 'enc-1',
        authoredByUserId: 'doc-1',
        createdAt: new Date('2026-03-18T08:45:00.000Z'),
        record: {
          id: 'history-record-1',
          patientId: 'patient-1',
          category: 'ALLERGY',
        },
      },
    ]);

    const result = await service.generatePack('clinic-1', '2026-03-01', '2026-03-21', 'exp-full');

    const subjectsCsv = result.repoFiles.find((file) => file.name === 'research_subjects.csv');
    const measurementsCsv = result.repoFiles.find(
      (file) => file.name === 'research_measurements.csv',
    );
    const appointmentsCsv = result.repoFiles.find(
      (file) => file.name === 'research_appointments.csv',
    );
    const revocationsCsv = result.repoFiles.find(
      (file) => file.name === 'research_revocations.csv',
    );
    const medicalHistoryCsv = result.repoFiles.find(
      (file) => file.name === 'research_medical_history.csv',
    );
    const tobaccoCsv = result.repoFiles.find(
      (file) => file.name === 'research_clinical_tobacco.csv',
    );
    const screeningsCsv = result.repoFiles.find(
      (file) => file.name === 'research_clinical_screenings.csv',
    );
    const adherenceCsv = result.repoFiles.find(
      (file) => file.name === 'research_medication_adherence.csv',
    );

    expect(result.recordCount).toBeGreaterThan(0);
    expect(result.manifest.datasetVersion).toBe(5);
    expect(subjectsCsv?.content).toContain('research_patient_key');
    expect(subjectsCsv?.content).toContain('1990');
    expect(subjectsCsv?.content).not.toContain('Witness');
    // Coarse region only; granular residence must never leak into exports.
    expect(subjectsCsv?.content).toContain('residential_region');
    expect(subjectsCsv?.content).toContain('GREATER_ACCRA');
    expect(subjectsCsv?.content).not.toContain('Accra Metropolitan');
    expect(subjectsCsv?.content).not.toContain('SecretCommunityName');
    expect(subjectsCsv?.content).not.toContain('SecretAddressNote');
    expect(measurementsCsv?.content).toContain('126');
    expect(measurementsCsv?.content).toContain('102');
    expect(measurementsCsv?.content).not.toContain('Do not leak');
    expect(tobaccoCsv?.content).toContain('smoking_status');
    expect(tobaccoCsv?.content).toContain('NEVER');
    expect(tobaccoCsv?.content).not.toContain('doctor-private-id');
    expect(screeningsCsv?.content).toContain('2026-03-18T08:45:00.000Z');

    /*
      The guided interview reaches the pack.

      A disposition of EXPORTED means nothing unless a column exists for it, and until #114
      hypertension had three columns for sixty fields, so none of this was analysable.
    */
    expect(screeningsCsv?.content).toContain('hypertension_derived_classification');
    expect(screeningsCsv?.content).toContain('STAGE1');
    // The override flag, without which a threshold result and a clinician's finding look alike.
    expect(screeningsCsv?.content).toContain('hypertension_classification_overridden');
    expect(screeningsCsv?.content).toContain('HEADACHE|BLURRED_VISION');
    // A year of diagnosis is banded: exact plus age is frequently unique in a clinic this size.
    expect(screeningsCsv?.content).toContain('2015');
    expect(screeningsCsv?.content).not.toContain('2017');
    // The clinician plan's prose stays out; the numeric goal, a shared scale, does not.
    expect(screeningsCsv?.content).toContain('hypertension_bp_goal_systolic');
    expect(screeningsCsv?.content).not.toContain('clinician_comments');
    expect(screeningsCsv?.content).not.toContain('clinician_plan_items');
    // A named facility locates the patient; only whether one is known is exported.
    expect(screeningsCsv?.content).not.toContain('usual_care_facility,');
    expect(screeningsCsv?.content).toContain('hypertension_usual_care_facility_status');

    expect(adherenceCsv?.content).toContain('research_medication_record_key');
    expect(adherenceCsv?.content).toContain('TWO_TO_THREE');
    expect(adherenceCsv?.content).toContain('COST|FORGETTING');
    // The medication is never named here; the keyed record joins to the reconciled list.
    expect(adherenceCsv?.content).not.toContain('medication-record-1');
    expect(adherenceCsv?.content).not.toContain('Amlodipine');
    expect(appointmentsCsv?.content).toContain('2026-03-25');
    expect(appointmentsCsv?.content).not.toContain('Should not leak');
    expect(revocationsCsv?.content).toContain('REVOKED');
    expect(medicalHistoryCsv?.content).toContain('ALLERGY');
    expect(medicalHistoryCsv?.content).toContain('SEVERE');
    expect(medicalHistoryCsv?.content).not.toContain('Penicillin');
    expect(medicalHistoryCsv?.content).not.toContain('Private reaction text');
    expect(medicalHistoryCsv?.content).not.toContain('Private clinical note');
    expect(fs.existsSync(result.artifactPath)).toBe(true);
  });
});
