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
  'heart_rate',
  'weight_kg',
  'height_cm',
  'bmi',
];

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
  'hypertension_suspected',
  'hypertension_confirmed',
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
              diabetesScreening: true,
              hypertensionAssessment: true,
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
        heart_rate: encounter.vitals?.heartRate ?? null,
        weight_kg: encounter.vitals?.weightKg ?? null,
        height_cm: encounter.vitals?.heightCm ?? null,
        bmi: encounter.vitals?.bmi ?? null,
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
          encounter.diabetesScreening?.createdAt ??
            encounter.hypertensionAssessment?.createdAt ??
            null,
        ),
        glucose_mg_dl: encounter.diabetesScreening?.glucoseMgDl ?? null,
        glucose_type: encounter.diabetesScreening?.glucoseType ?? null,
        hba1c_percent: encounter.diabetesScreening?.hba1cPercent ?? null,
        hypertension_classification: encounter.hypertensionAssessment?.classification ?? null,
        hypertension_suspected: encounter.hypertensionAssessment?.suspected ?? null,
        hypertension_confirmed: encounter.hypertensionAssessment?.confirmed ?? null,
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

    const csvFiles = [
      this.createCsvFile('research_subjects.csv', SUBJECT_HEADERS, subjectRows),
      this.createCsvFile('research_ops_checkins.csv', CHECKIN_HEADERS, checkInRows),
      this.createCsvFile('research_ops_assignments.csv', ASSIGNMENT_HEADERS, assignmentRows),
      this.createCsvFile('research_clinical_vitals.csv', VITALS_HEADERS, vitalsRows),
      this.createCsvFile('research_clinical_screenings.csv', SCREENING_HEADERS, screeningRows),
      this.createCsvFile('research_measurements.csv', MEASUREMENT_HEADERS, measurementRows),
      this.createCsvFile('research_appointments.csv', APPOINTMENT_HEADERS, appointmentRows),
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
