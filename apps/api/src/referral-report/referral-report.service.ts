import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalNoteStatus,
  MedicalHistoryCategory,
  MedicalHistoryStatus,
  PatientMedicationStatus,
  UserRole,
} from '@prisma/client';
import {
  CLINIC_DEFAULT_TIMEZONE,
  DIABETES_GLUCOSE_CONTEXT_LABELS,
  GHANA_REGION_LABELS,
  VISION_LOSS_CAUSE_LABELS,
  describeAdherence,
  formatGlucose,
  formatHba1c,
  formatPersonName,
  glanceLines,
  type GlanceLinesInput,
  type PatientChartFeatureFlag,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientChartService, type ChartActor } from '../patient-chart/patient-chart.service';
import { MedicalHistoryService } from '../medical-history/medical-history.service';
import { permissionsForClinic, rolesForClinic } from '../auth/clinic-roles';
import { PERMISSIONS } from '../auth/constants/permissions';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { EMAIL_PROVIDER } from '../notifications/email/email-provider.token';
import type { EmailProvider } from '../notifications/email/email-provider.interface';
import { renderReferralEmail } from '../notifications/templates/referral-report';
import { renderHypertensionNarrative } from '../clinical-notes/narrative/hypertension-narrative';
import { renderDiabetesNarrative } from '../clinical-notes/narrative/diabetes-narrative';
import { medicationLinesFor } from '../clinical-notes/narrative/medication-lines';
import {
  allowedReferralSections,
  generatePasscode,
  has,
  resolveReferralSections,
  type ReferralReportSection,
} from './referral-report-sections';
import {
  renderReferralReportPdf,
  type ReferralReportContent,
  type ReportBlock,
  type ReportSection,
} from './referral-report-pdf';
import type { CreateReferralReportDto } from './dto/referral-report.dto';

export const REFERRAL_REPORT_EXPORT_ACTION = 'REFERRAL_REPORT.EXPORT';
const READINGS = 6;

const URGENCY_LABELS: Record<string, string> = {
  ROUTINE: 'Routine',
  SOON: 'Soon (within weeks)',
  URGENT: 'Urgent',
};
const SEX_LABELS: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };
const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  DOCTOR: 'Doctor',
  VOLUNTEER: 'Clinical volunteer',
  SYSTEM_ADMIN: 'System administrator',
};
const SOCIAL_LABELS: Record<string, string> = {
  TOBACCO: 'Tobacco use',
  ALCOHOL: 'Alcohol use',
  SUBSTANCE_USE: 'Substance use',
  OCCUPATION: 'Occupation',
  LIVING_SITUATION: 'Living situation',
};

export type ReferralReportResult =
  | { delivery: 'DOWNLOAD'; passcode: string; filename: string; file: string; sizeBytes: number }
  | { delivery: 'EMAIL'; passcode: string; sentTo: string };

function enabledFlags(): PatientChartFeatureFlag[] {
  return (['medicalHistory', 'medicationReconciliation', 'clinicalNotes'] as const).filter((flag) =>
    isApiFeatureEnabled(flag),
  );
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

@Injectable()
export class ReferralReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chart: PatientChartService,
    private readonly history: MedicalHistoryService,
    private readonly audit: AuditService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  /** The sections this sender may tick, for the sheet. */
  allowedSections(clinicId: string, actor: ChartActor): ReferralReportSection[] {
    const sections = allowedReferralSections(
      permissionsForClinic(actor.roles, clinicId),
      enabledFlags(),
    );
    // Note content needs a clinical seat here, as on the chart: a system admin's wildcard is not one.
    const clinical = rolesForClinic(actor.roles, clinicId).some(
      ({ role }) => role === UserRole.DOCTOR || role === UserRole.VOLUNTEER,
    );
    return clinical ? sections : sections.filter((section) => section !== 'NOTES');
  }

  /** The patient's current referral consent at this clinic, if one is granted (#344). */
  referralConsent(clinicId: string, patientId: string) {
    return this.prisma.patientConsent.findFirst({
      where: { clinicId, patientId, consentType: 'REFERRAL_SHARING', status: 'GRANTED' },
      orderBy: { grantedAt: 'desc' },
      select: { id: true, grantedAt: true },
    });
  }

  async create(
    clinicId: string,
    patientId: string,
    actor: ChartActor,
    dto: CreateReferralReportDto,
  ): Promise<ReferralReportResult> {
    const { sections, refused } = resolveReferralSections(
      dto.sections,
      this.allowedSections(clinicId, actor),
    );
    if (refused.length) {
      throw new ForbiddenException({
        code: 'REFERRAL_SECTION_FORBIDDEN',
        message: `You cannot include ${refused.join(', ').toLowerCase()} in a report.`,
      });
    }
    const consent = await this.referralConsent(clinicId, patientId);
    if (!consent && dto.patientAgreedToday !== true) {
      throw new BadRequestException({
        code: 'REFERRAL_CONSENT_REQUIRED',
        message: 'Confirm that the patient agreed to this referral today.',
        fieldErrors: [
          {
            field: 'patientAgreedToday',
            message: 'Confirm that the patient agreed to this referral today.',
          },
        ],
      });
    }

    const content = await this.buildContent(clinicId, patientId, actor, dto, sections);
    const passcode = generatePasscode();
    const pdf = await renderReferralReportPdf(content.report, passcode);
    const day = content.report.generatedAt.toISOString().slice(0, 10);

    let result: ReferralReportResult;
    if (dto.delivery === 'EMAIL') {
      const message = renderReferralEmail({
        clinicName: content.report.clinic.name,
        recipientName: dto.recipientName ?? null,
      });
      const sent = await this.email.send(
        dto.recipientEmail!,
        message.subject,
        message.html,
        message.text,
        [
          // No patient detail in the name: mail servers and clients log attachment names.
          { filename: `referral-report-${day}.pdf`, content: pdf, contentType: 'application/pdf' },
        ],
      );
      if (!sent.success) {
        throw new BadGatewayException({
          code: 'REFERRAL_EMAIL_FAILED',
          message: 'The email could not be sent. Nothing was shared. Try again, or download it.',
        });
      }
      result = { delivery: 'EMAIL', passcode, sentTo: dto.recipientEmail! };
    } else {
      result = {
        delivery: 'DOWNLOAD',
        passcode,
        filename: `referral-${content.patientCode}-${day}.pdf`,
        file: pdf.toString('base64'),
        sizeBytes: pdf.length,
      };
    }

    // After delivery, so a failed send leaves no record of a report that was never shared. Never
    // the passcode, and the recipient's address only by its domain.
    await this.audit.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: REFERRAL_REPORT_EXPORT_ACTION,
      entityType: 'Patient',
      entityId: patientId,
      afterJson: JSON.stringify({
        delivery: dto.delivery,
        recipientFacility: dto.recipientFacility ?? null,
        recipientEmailDomain:
          dto.delivery === 'EMAIL' ? dto.recipientEmail!.split('@').pop() : null,
        urgency: dto.urgency ?? null,
        sections,
        // What the share rested on: the consent on file, or the sender's word that the patient agreed.
        consentBasis: consent ? 'RECORDED_CONSENT' : 'AGREED_TODAY',
        consentId: consent?.id ?? null,
        patientAgreedToday: dto.patientAgreedToday === true,
        sizeBytes: pdf.length,
      }),
    });
    return result;
  }

  /** Everything the PDF prints. Exported through the service so the content can be tested. */
  async buildContent(
    clinicId: string,
    patientId: string,
    actor: ChartActor,
    dto: Pick<
      CreateReferralReportDto,
      'reason' | 'urgency' | 'recipientName' | 'recipientFacility'
    >,
    sections: readonly ReferralReportSection[],
    now = new Date(),
  ): Promise<{ report: ReferralReportContent; patientCode: string }> {
    const [patient, clinic, sender] = await Promise.all([
      this.prisma.patient.findFirst({
        where: { id: patientId, primaryClinicId: clinicId, mergedIntoPatientId: null },
      }),
      this.prisma.clinic.findUnique({ where: { id: clinicId } }),
      this.prisma.user.findUnique({ where: { id: actor.userId } }),
    ]);
    if (!patient || !clinic) throw new NotFoundException('Patient not found in the active clinic');

    const permissions = permissionsForClinic(actor.roles, clinicId);
    const can = (permission: string) => has(permissions, permission);
    const timezone = clinic.timezone || CLINIC_DEFAULT_TIMEZONE;
    const units = { glucoseUnit: clinic.glucoseUnit, hba1cUnit: clinic.hba1cUnit };
    const day = (at: Date | string) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(at));
    /** A date-only column, read as the day written. */
    const calendar = (at: Date) => day(`${at.toISOString().slice(0, 10)}T12:00:00Z`);

    const heldRoles = rolesForClinic(actor.roles, clinicId).map((entry) => entry.role);
    const role =
      (['DOCTOR', 'VOLUNTEER', 'SYSTEM_ADMIN'] as const).find((r) => heldRoles.includes(r)) ??
      heldRoles[0];
    const senderName =
      (sender && (formatPersonName(sender) || sender.displayName)) || 'Clinic staff';

    let narratives: ReturnType<ReferralReportService['narratives']> | undefined;
    const ctx = {
      clinicId,
      patientId,
      actor,
      can,
      day,
      calendar,
      units,
      // Assessments and plan both read them; one query.
      narratives: () => (narratives ??= this.narratives(clinicId, patientId, can)),
    };
    const out: ReportSection[] = [];
    for (const section of sections) {
      const built = await this.section(section, ctx);
      if (built) out.push(built);
    }

    const location = [
      patient.residentialDigitalAddress
        ? `Digital Address ${patient.residentialDigitalAddress}`
        : null,
      [
        patient.residentialCommunity,
        patient.residentialDistrict,
        patient.residentialRegion ? GHANA_REGION_LABELS[patient.residentialRegion] : null,
      ]
        .filter(Boolean)
        .join(', ') || null,
      patient.residentialLandmark ? `Near ${patient.residentialLandmark}` : null,
    ].filter(Boolean);

    const report: ReferralReportContent = {
      clinic: {
        name: clinic.name,
        contact:
          [clinic.address ?? clinic.region, clinic.contactPhone, clinic.contactEmail]
            .filter(Boolean)
            .join('  ·  ') || null,
      },
      generatedAt: now,
      timezone,
      sender: { name: senderName, role: (role && ROLE_LABELS[role]) ?? 'Clinic staff' },
      recipient: { name: dto.recipientName ?? null, facility: dto.recipientFacility ?? null },
      reason: dto.reason,
      urgency: dto.urgency ? URGENCY_LABELS[dto.urgency] : null,
      patient: [
        { label: 'Name', value: formatPersonName(patient, 'full') },
        { label: 'Patient code', value: patient.patientCode },
        { label: 'Sex', value: SEX_LABELS[patient.sex] ?? 'Not recorded' },
        {
          label: 'Date of birth',
          value: patient.dob
            ? `${calendar(patient.dob)} (age ${ageOn(patient.dob, now)})`
            : 'Not recorded',
        },
        { label: 'Phone', value: patient.phoneE164 ?? 'Not recorded' },
        {
          label: 'National ID',
          value: patient.nationalIdLast4
            ? `Ending ${patient.nationalIdLast4.slice(-4)}`
            : 'Not recorded',
        },
        // The home's map position is left out: the Digital Address finds it without the numbers.
        { label: 'Residence', value: location.length ? location.join('. ') : 'Not recorded' },
      ],
      sections: out,
    };
    return { report, patientCode: patient.patientCode };
  }

  private async section(
    section: ReferralReportSection,
    ctx: {
      clinicId: string;
      patientId: string;
      actor: ChartActor;
      can: (permission: string) => boolean;
      day: (at: Date | string) => string;
      calendar: (at: Date) => string;
      units: { glucoseUnit: 'MG_DL' | 'MMOL_L'; hba1cUnit: 'PERCENT' | 'MMOL_MOL' };
      narratives: () => ReturnType<ReferralReportService['narratives']>;
    },
  ): Promise<ReportSection | null> {
    const { clinicId, patientId, can, day, calendar, units } = ctx;
    const scope = { clinicId, encounter: { patientId } };

    switch (section) {
      case 'SUMMARY': {
        // The chart's own glance, filtered by the same permissions (#341).
        const summary = await this.chart.getSummary(clinicId, patientId, ctx.actor);
        const glance = JSON.parse(JSON.stringify(summary.glance)) as GlanceLinesInput;
        const lines = glanceLines(
          glance,
          units,
          () => true,
          (at) => day(at),
        );
        return {
          title: 'Summary',
          blocks: [
            {
              kind: 'lines',
              rows: lines.map((line) => ({
                label: line.label,
                text: line.text,
                muted: line.empty,
              })),
            },
          ],
        };
      }

      case 'HISTORY': {
        const [records, allergies] = await Promise.all([
          this.prisma.medicalHistoryRecord.findMany({
            where: {
              clinicId,
              patientId,
              currentRevision: { status: MedicalHistoryStatus.ACTIVE },
            },
            include: { currentRevision: true },
            orderBy: { updatedAt: 'desc' },
          }),
          this.history.getAllergySummary(clinicId, patientId),
        ]);
        const of = (category: MedicalHistoryCategory) =>
          records
            .filter((r) => r.category === category && r.currentRevision)
            .map((r) => ({
              details: (r.currentRevision!.details ?? {}) as Record<string, unknown>,
              rev: r.currentRevision!,
            }));
        const conditions = of(MedicalHistoryCategory.CONDITION).map(({ details, rev }) =>
          [
            text(details.conditionName) ?? 'Condition',
            rev.onsetDate ? `since ${calendar(rev.onsetDate)}` : null,
          ]
            .filter(Boolean)
            .join(', '),
        );
        const allergyText =
          allergies.state === 'ACTIVE_ALLERGIES'
            ? allergies.activeAllergies
                .map((a) =>
                  [
                    a.substance ?? 'Unnamed',
                    [a.severity !== 'UNKNOWN' ? String(a.severity).toLowerCase() : null, a.reaction]
                      .filter(Boolean)
                      .join(', '),
                  ]
                    .filter(Boolean)
                    .join(': '),
                )
                .join('; ')
            : allergies.state === 'NO_KNOWN_ALLERGIES'
              ? 'No known allergies'
              : 'Allergy status not recorded';
        const surgeries = of(MedicalHistoryCategory.SURGERY_PROCEDURE).map(({ details, rev }) =>
          [
            text(details.procedureName) ?? 'Procedure',
            rev.occurrenceDate ? calendar(rev.occurrenceDate) : null,
          ]
            .filter(Boolean)
            .join(', '),
        );
        const family = of(MedicalHistoryCategory.FAMILY_HISTORY).map(
          ({ details }) =>
            `${text(details.relationship) ?? 'Family'}: ${text(details.familyCondition) ?? 'condition'}`,
        );
        const social = of(MedicalHistoryCategory.SOCIAL_HISTORY).map(({ details }) =>
          [SOCIAL_LABELS[String(details.socialType)] ?? 'Social history', text(details.description)]
            .filter(Boolean)
            .join(': '),
        );
        const row = (label: string, items: string[], empty: string) => ({
          label,
          text: items.length ? items.join('; ') : empty,
          muted: items.length === 0,
        });
        return {
          title: 'Conditions and history',
          blocks: [
            {
              kind: 'lines',
              rows: [
                row('Conditions', conditions, 'None recorded'),
                {
                  label: 'Allergies',
                  text: allergyText,
                  muted:
                    allergies.state === 'NOT_RECORDED' || allergies.state === 'HISTORICAL_ONLY',
                },
                row('Surgery', surgeries, 'None recorded'),
                row('Family history', family, 'None recorded'),
                row('Social history', social, 'None recorded'),
              ],
            },
          ],
        };
      }

      case 'READINGS': {
        const [vitals, glucose, hba1c] = await Promise.all([
          this.prisma.vitals.findMany({
            where: { ...scope, systolicBp: { not: null }, diastolicBp: { not: null } },
            include: {
              encounter: {
                select: {
                  hypertensionAssessment: {
                    select: { repeatSystolicBp: true, repeatDiastolicBp: true },
                  },
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: READINGS,
          }),
          this.prisma.diabetesScreening.findMany({
            where: { ...scope, glucoseMgDl: { not: null } },
            orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
            take: READINGS,
          }),
          this.prisma.diabetesScreening.findMany({
            where: { ...scope, hba1cPercent: { not: null } },
            orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
            take: READINGS,
          }),
        ]);
        const blocks: ReportBlock[] = [
          {
            kind: 'table',
            caption: `Blood pressure (last ${READINGS})`,
            columns: ['Date', 'Blood pressure', 'Pulse'],
            rows: vitals.map((v) => {
              const repeat = v.encounter.hypertensionAssessment;
              return [
                day(v.createdAt),
                `${v.systolicBp}/${v.diastolicBp} mmHg` +
                  (repeat?.repeatSystolicBp && repeat.repeatDiastolicBp
                    ? `, repeat ${repeat.repeatSystolicBp}/${repeat.repeatDiastolicBp}`
                    : ''),
                v.pulseBpm ? `${v.pulseBpm} bpm` : '-',
              ];
            }),
            empty: 'No blood pressure recorded.',
          },
          {
            kind: 'table',
            caption: `Glucose (last ${READINGS})`,
            columns: ['Date', 'Glucose', 'When taken'],
            rows: glucose.map((g) => [
              day(g.collectedAt),
              formatGlucose(g.glucoseMgDl, units.glucoseUnit) ?? '-',
              DIABETES_GLUCOSE_CONTEXT_LABELS[
                g.glucoseType as keyof typeof DIABETES_GLUCOSE_CONTEXT_LABELS
              ] ?? 'Not stated',
            ]),
            empty: 'No glucose recorded.',
          },
          {
            kind: 'table',
            caption: `HbA1c (last ${READINGS})`,
            columns: ['Date', 'HbA1c'],
            rows: hba1c.map((g) => [
              day(g.collectedAt),
              formatHba1c(g.hba1cPercent, units.hba1cUnit) ?? '-',
            ]),
            empty: 'No HbA1c recorded.',
          },
        ];
        return { title: 'Readings', blocks: compactEmptyTables(blocks) };
      }

      case 'MEDICATIONS': {
        const [records, lastReconciliation, prescriptions] = await Promise.all([
          this.prisma.patientMedicationRecord.findMany({
            where: {
              clinicId,
              patientId,
              currentRevision: { status: PatientMedicationStatus.CURRENT },
            },
            include: {
              currentRevision: true,
              adherence: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          }),
          this.prisma.medicationReconciliationEvent.findFirst({
            where: { clinicId, patientId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { outcome: true, createdAt: true },
          }),
          can(PERMISSIONS.PRESCRIPTION_READ)
            ? this.prisma.prescription.findMany({
                where: scope,
                include: { drug: { select: { name: true } } },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 10,
              })
            : null,
        ]);
        const current = records
          .filter((r) => r.currentRevision)
          .map((r) => {
            const rev = r.currentRevision!;
            const adherence = r.adherence[0];
            const clause = adherence ? describeAdherence(adherence) : null;
            return [
              [rev.medicationName, rev.strength].filter(Boolean).join(' '),
              [[rev.dose, rev.doseUnit].filter(Boolean).join(' '), rev.route, rev.frequency]
                .filter(Boolean)
                .join(', ') || '-',
              clause && adherence
                ? `${clause[0].toUpperCase()}${clause.slice(1)} (${day(adherence.createdAt)})`
                : 'Not recorded',
            ];
          })
          .sort((a, b) => (a[0] < b[0] ? -1 : 1));
        const blocks: ReportBlock[] = [
          {
            kind: 'table',
            caption: 'Current medications',
            columns: ['Medication', 'Dose', 'Adherence'],
            rows: current,
            empty:
              lastReconciliation?.outcome === 'NO_KNOWN_CURRENT_MEDICATIONS'
                ? `No known current medications (reconciled ${day(lastReconciliation.createdAt)}).`
                : 'No current medications recorded.',
          },
        ];
        if (prescriptions) {
          blocks.push({
            kind: 'table',
            caption: 'Prescriptions written at this clinic',
            columns: ['Date', 'Drug', 'Dosage', 'Duration'],
            rows: prescriptions.map((p) => [
              day(p.createdAt),
              p.drug.name,
              [p.dosage, p.frequency].filter(Boolean).join(', '),
              p.duration ?? '-',
            ]),
            empty: 'No prescriptions written at this clinic.',
          });
        }
        return { title: 'Medications', blocks: compactEmptyTables(blocks) };
      }

      case 'ASSESSMENTS': {
        const narratives = await ctx.narratives();
        const eye = await this.prisma.eyeScreening.findFirst({
          where: scope,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const items = narratives.flatMap((n) =>
          [n.history, n.assessment].filter(Boolean).length
            ? [
                {
                  heading: `${n.label}, ${day(n.at)}`,
                  text: [n.history, n.assessment].filter(Boolean).join('\n\n'),
                },
              ]
            : [],
        );
        const blocks: ReportBlock[] = [
          items.length
            ? { kind: 'paragraphs', items }
            : {
                kind: 'paragraphs',
                items: [{ text: 'No hypertension or diabetes assessment recorded.' }],
              },
        ];
        if (eye) {
          const acuity = (label: string, right: string | null, left: string | null) =>
            right || left ? `${label}: right ${right ?? '-'}, left ${left ?? '-'}` : null;
          const signs = [
            eye.diabeticSignsSeen ? 'diabetic changes' : null,
            eye.hypertensiveSignsSeen ? 'hypertensive changes' : null,
          ].filter(Boolean);
          blocks.push({
            kind: 'lines',
            rows: [
              {
                label: `Eyes, ${day(eye.createdAt)}`,
                text:
                  [
                    acuity('Unaided', eye.vaOdUnaided, eye.vaOsUnaided),
                    acuity('Aided', eye.vaOdAided, eye.vaOsAided),
                    eye.cupDiscRatioOd || eye.cupDiscRatioOs
                      ? `Cup to disc ratio: right ${eye.cupDiscRatioOd ?? '-'}, left ${eye.cupDiscRatioOs ?? '-'}`
                      : null,
                    eye.visionLossCause
                      ? `Vision loss: ${VISION_LOSS_CAUSE_LABELS[eye.visionLossCause].toLowerCase()}`
                      : null,
                    signs.length
                      ? `Signs seen: ${signs.join(' and ')}`
                      : 'No diabetic or hypertensive changes seen',
                    eye.referralRecommended
                      ? `Eye referral recommended${eye.referralNote ? `: ${eye.referralNote}` : ''}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join('. ') + '.',
              },
            ],
          });
        }
        return { title: 'Latest assessments', blocks };
      }

      case 'PLAN': {
        const carePlan = await this.prisma.carePlan.findFirst({
          where: scope,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const rows = [
          {
            label: 'Next follow-up',
            text: carePlan?.followUpDate
              ? calendar(carePlan.followUpDate)
              : 'No follow-up date set',
            muted: !carePlan?.followUpDate,
          },
        ];
        if (carePlan) {
          rows.push({
            label: `Care plan, ${day(carePlan.createdAt)}`,
            text:
              [
                carePlan.counselingGiven ? 'Counselling given' : null,
                carePlan.medicationPrescribed ? 'Medication prescribed' : null,
                text(carePlan.notes),
              ]
                .filter(Boolean)
                .join('. ') || 'No details recorded',
            muted: false,
          });
        }
        const blocks: ReportBlock[] = [{ kind: 'lines', rows }];
        // The interviews' plan sentences, which carry the supervising clinician's plan only for a
        // sender who may read it (the narrative renderers leave it out otherwise).
        if (can(PERMISSIONS.SCREENING_READ)) {
          const plans = (await ctx.narratives())
            .filter((n) => n.plan)
            .map((n) => ({ heading: `${n.label} plan`, text: n.plan }));
          if (plans.length) blocks.push({ kind: 'paragraphs', items: plans });
        }
        // shortcut: the risk tier joins this section once #336 ships a stored tier to read.
        return { title: 'Plan', blocks };
      }

      case 'NOTES': {
        const notes = await this.prisma.clinicalNote.findMany({
          where: {
            clinicId,
            patientId,
            status: {
              in: [
                ClinicalNoteStatus.COSIGNED,
                ClinicalNoteStatus.AMENDED,
                ClinicalNoteStatus.PENDING_COSIGN,
              ],
            },
            signedContentHash: { not: null },
          },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          take: 5,
        });
        return {
          title: 'Signed clinical notes',
          blocks: [
            {
              kind: 'paragraphs',
              items: notes.length
                ? notes.map((note) => ({
                    heading: `Note signed ${day(note.submittedAt ?? note.createdAt)}${note.cosignedAt ? `, cosigned ${day(note.cosignedAt)}` : ''}`,
                    text: [
                      note.signedHistory && `History: ${note.signedHistory}`,
                      note.signedAssessment && `Assessment: ${note.signedAssessment}`,
                      note.signedPlan && `Plan: ${note.signedPlan}`,
                    ]
                      .filter(Boolean)
                      .join('\n\n'),
                  }))
                : [{ text: 'No signed notes.' }],
            },
          ],
        };
      }
    }
  }

  /** The latest hypertension and diabetes interviews, as the clinical note generator words them. */
  private async narratives(
    clinicId: string,
    patientId: string,
    can: (permission: string) => boolean,
  ) {
    const encounterInclude = {
      encounter: {
        select: {
          patient: { select: { firstName: true, middleName: true, lastName: true } },
          vitals: { select: { systolicBp: true, diastolicBp: true, pulseBpm: true } },
          clinic: { select: { glucoseUnit: true, bodyUnit: true, hba1cUnit: true } },
          medicationAdherence: {
            include: {
              observedRevision: {
                select: {
                  medicationName: true,
                  strength: true,
                  dose: true,
                  doseUnit: true,
                  frequency: true,
                },
              },
            },
          },
        },
      },
    } as const;
    const where = { clinicId, encounter: { patientId } };
    const [hypertension, diabetes] = await Promise.all([
      this.prisma.hypertensionAssessment.findFirst({
        where,
        include: encounterInclude,
        orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.diabetesScreening.findFirst({
        where,
        include: encounterInclude,
        orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const maySeePlan = can(PERMISSIONS.CAREPLAN_CLINICIAN_PLAN);
    const out: Array<{
      label: string;
      at: Date;
      history: string;
      assessment: string;
      plan: string;
    }> = [];
    if (hypertension) {
      const { encounter, ...record } = hypertension;
      const sections = renderHypertensionNarrative({
        patientName: formatPersonName(encounter.patient, 'full'),
        assessment: record as unknown as Record<string, unknown>,
        vitals: encounter.vitals,
        medications: medicationLinesFor(encounter.medicationAdherence, 'HYPERTENSION'),
        clinicianPlan: maySeePlan
          ? {
              items: record.clinicianPlanItems,
              other: record.clinicianPlanOther,
              bpGoalSystolic: record.bpGoalSystolic,
              bpGoalDiastolic: record.bpGoalDiastolic,
              followUpWindow: record.followUpWindow,
              followUpOther: record.followUpOther,
              followUpOwner: record.followUpOwner,
              comments: record.clinicianComments,
            }
          : null,
      });
      out.push({ label: 'Hypertension', at: record.collectedAt, ...sections });
    }
    if (diabetes) {
      const { encounter, ...record } = diabetes;
      const sections = renderDiabetesNarrative({
        patientName: formatPersonName(encounter.patient, 'full'),
        assessment: record as unknown as Record<string, unknown>,
        vitals: encounter.vitals,
        medications: medicationLinesFor(encounter.medicationAdherence, 'DIABETES'),
        units: encounter.clinic,
        clinicianPlan: maySeePlan
          ? {
              items: record.clinicianPlanItems,
              other: record.clinicianPlanOther,
              followUpWindow: record.followUpWindow,
              followUpOther: record.followUpOther,
              followUpOwner: record.followUpOwner,
              comments: record.clinicianComments,
            }
          : null,
      });
      out.push({ label: 'Diabetes', at: record.collectedAt, ...sections });
    }
    return out;
  }
}

/** Whole years on `on`, counting a birthday not yet reached this year. */
export function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dob.getUTCMonth() ||
    (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

/**
 * Tables with nothing in them collapse into one line of sentences, so a patient with almost no data
 * gets a short tidy section rather than a column of captions each saying "none".
 */
export function compactEmptyTables(blocks: ReportBlock[]): ReportBlock[] {
  const tables = blocks.filter(
    (b): b is Extract<ReportBlock, { kind: 'table' }> => b.kind === 'table',
  );
  if (tables.length < 2 || tables.some((t) => t.rows.length > 0)) return blocks;
  return [{ kind: 'paragraphs', items: [{ text: tables.map((t) => t.empty).join(' ') }] }];
}
