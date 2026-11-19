import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { FollowUpContactStatus, FollowUpTier, Prisma } from '@prisma/client';
import {
  addDays,
  DEFAULT_FOLLOW_UP_CONFIG,
  DIABETES_ESCALATION_REASON_LABELS,
  deriveDiabetesEscalation,
  deriveHypertensionEscalation,
  FOLLOW_UP_TIERS,
  formatPersonName,
  HYPERTENSION_ESCALATION_REASON_LABELS,
  nextContact,
  type FollowUpAction,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildKeysetWhere, decodeKeysetCursor, encodeKeysetCursor } from '../common/keyset-cursor';
import { ROLE_PERMISSIONS, PERMISSIONS } from '../auth/constants/permissions';
import { FollowUpRiskService } from './follow-up-risk.service';
import { FollowUpFlagService } from './follow-up-flags.service';
import { dayOf, isInPerson } from './contact-schedule';
import type {
  CancelFollowUpContactDto,
  ListFollowUpContactsQueryDto,
  RecordFollowUpAttemptDto,
} from './dto/follow-up-contact.dto';

const PAGE_SIZE = 50;
/**
 * shortcut: the offline copy holds at most this many open contacts due within the week, most
 * urgent first; the response says when it was cut. Raise it, or split by owner, if a clinic's
 * week ever passes it.
 */
export const OFFLINE_PACKET_LIMIT = 500;

/** Where a due-tab page ended: the patient's tier, the due day and the contact. */
interface DueCursor {
  t: FollowUpTier | null;
  d: string;
  i: string;
}

function encodeDueCursor(cursor: DueCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeDueCursor(raw: string): DueCursor {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString()) as DueCursor;
    const tierOk = value.t === null || (FOLLOW_UP_TIERS as readonly string[]).includes(value.t);
    if (tierOk && /^\d{4}-\d{2}-\d{2}$/.test(value.d) && /^[0-9a-f-]{36}$/i.test(value.i)) {
      return value;
    }
  } catch {
    // Falls through to the refusal below.
  }
  throw new BadRequestException('That page of contacts no longer exists. Reload the list.');
}

/**
 * The rows after a cursor, in (tier, dueOn, id) order. Prisma has no greater-than for enums, so
 * "a later tier" is the list of tiers declared after it, which is urgency order; no tier is last.
 */
function afterDueCursor(cursor: DueCursor): Prisma.FollowUpContactWhereInput {
  const dueOn = new Date(`${cursor.d}T00:00:00Z`);
  const rank = cursor.t === null ? FOLLOW_UP_TIERS.length : FOLLOW_UP_TIERS.indexOf(cursor.t);
  const later = FOLLOW_UP_TIERS.slice(rank + 1);
  const sameTier = { patient: { currentRiskTier: cursor.t } };
  return {
    OR: [
      ...(cursor.t === null
        ? []
        : [
            { patient: { currentRiskTier: { in: [...later] } } },
            { patient: { currentRiskTier: null } },
          ]),
      { ...sameTier, dueOn: { gt: dueOn } },
      { ...sameTier, dueOn, id: { gt: cursor.i } },
    ],
  };
}

const DUE_ORDER: Prisma.FollowUpContactOrderByWithRelationInput[] = [
  { patient: { currentRiskTier: { sort: 'asc', nulls: 'last' } } },
  { dueOn: 'asc' },
  { id: 'asc' },
];

/** Cancelling for one of these stops new contacts until the patient is next seen in person. */
const STOPPING_REASONS = new Set(['DECEASED', 'MOVED', 'OPTED_OUT']);

/** The roles that hold FOLLOW_UP.MANAGE, and so can own a contact. */
const MANAGE_ROLES = (Object.entries(ROLE_PERMISSIONS) as Array<[string, readonly string[]]>)
  .filter(
    ([role, perms]) => role !== 'SYSTEM_ADMIN' && perms.includes(PERMISSIONS.FOLLOW_UP_MANAGE),
  )
  .map(([role]) => role);

const CONTACT_SELECT = {
  id: true,
  mode: true,
  purpose: true,
  status: true,
  dueOn: true,
  completedAt: true,
  tierAtScheduling: true,
  owner: { select: { id: true, displayName: true } },
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phoneE164: true,
      currentRiskTier: true,
    },
  },
  attempts: {
    orderBy: { at: 'desc' as const },
    take: 1,
    select: { at: true, outcome: true, mode: true },
  },
  _count: { select: { attempts: true } },
} satisfies Prisma.FollowUpContactSelect;

type ContactRow = Prisma.FollowUpContactGetPayload<{ select: typeof CONTACT_SELECT }>;

const DETAIL_SELECT = {
  ...CONTACT_SELECT,
  patient: {
    select: {
      ...CONTACT_SELECT.patient.select,
      residentialLocationStatus: true,
      residentialCommunity: true,
      residentialDigitalAddress: true,
      residentialLandmark: true,
      residentialLatitude: true,
      residentialLongitude: true,
      currentRiskAssessment: {
        select: { tier: true, atTarget: true, actions: true, inputSnapshot: true },
      },
      encounters: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { createdAt: true } },
    },
  },
} satisfies Prisma.FollowUpContactSelect;

type DetailRow = Prisma.FollowUpContactGetPayload<{ select: typeof DETAIL_SELECT }>;

/**
 * Follow-up contacts (#338): the worklist, taking a contact, recording what happened and
 * cancelling. Every write runs as the system after the guard has checked FOLLOW_UP.MANAGE and the
 * clinic, so every query here scopes by clinic by hand.
 */
@Injectable()
export class FollowUpContactService {
  private readonly logger = new Logger(FollowUpContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly risk: FollowUpRiskService,
    private readonly flags: FollowUpFlagService,
  ) {}

  private system<T>(reason: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.detachFromRlsContext(() =>
      this.prisma.withSystemContext({ systemReason: reason }, work),
    );
  }

  async list(clinicId: string, userId: string, query: ListFollowUpContactsQueryDto) {
    const today = dayOf(new Date());
    const tabWhere: Record<string, Prisma.FollowUpContactWhereInput> = {
      today: { status: 'DUE', dueOn: today },
      overdue: { status: { in: ['DUE', 'MISSED'] }, dueOn: { lt: today } },
      week: { status: 'DUE', dueOn: { gt: today, lte: addDays(today, 7) } },
      done: { status: 'DONE' },
    };
    const q = query.q?.trim();
    const where: Prisma.FollowUpContactWhereInput = {
      clinicId,
      ...tabWhere[query.tab],
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.owner === 'me'
        ? { ownerUserId: userId }
        : query.owner === 'none'
          ? { ownerUserId: null }
          : query.owner
            ? { ownerUserId: query.owner }
            : {}),
      patient: {
        mergedIntoPatientId: null,
        ...(query.tier ? { currentRiskTier: query.tier } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { patientCode: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    return this.system('List follow-up contacts', async (tx) => {
      if (query.tab === 'done') {
        const cursor = query.cursor
          ? decodeKeysetCursor(query.cursor, 'That page of done contacts no longer exists.')
          : null;
        const rows = await tx.followUpContact.findMany({
          where: { ...where, ...buildKeysetWhere('completedAt', cursor) },
          orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
          take: PAGE_SIZE + 1,
          select: CONTACT_SELECT,
        });
        const page = rows.slice(0, PAGE_SIZE);
        const last = page[page.length - 1];
        return {
          items: page.map((row) => this.toItem(row, today)),
          nextCursor:
            rows.length > PAGE_SIZE && last?.completedAt
              ? encodeKeysetCursor(last.completedAt, last.id)
              : null,
        };
      }
      const cursor = query.cursor ? decodeDueCursor(query.cursor) : null;
      const rows = await tx.followUpContact.findMany({
        where: cursor ? { AND: [where, afterDueCursor(cursor)] } : where,
        orderBy: DUE_ORDER,
        take: PAGE_SIZE + 1,
        select: CONTACT_SELECT,
      });
      const page = rows.slice(0, PAGE_SIZE);
      const last = page[page.length - 1];
      return {
        items: page.map((row) => this.toItem(row, today)),
        nextCursor:
          rows.length > PAGE_SIZE && last
            ? encodeDueCursor({
                t: last.patient.currentRiskTier,
                d: last.dueOn.toISOString().slice(0, 10),
                i: last.id,
              })
            : null,
      };
    });
  }

  private toItem(row: ContactRow, today: Date) {
    const tier = row.patient.currentRiskTier ?? row.tierAtScheduling;
    const late = Math.round((today.getTime() - row.dueOn.getTime()) / 86_400_000);
    return {
      id: row.id,
      mode: row.mode,
      purpose: row.purpose,
      status: row.status,
      dueOn: row.dueOn.toISOString().slice(0, 10),
      daysOverdue: row.status === 'DONE' ? 0 : Math.max(0, late),
      completedAt: row.completedAt,
      owner: row.owner,
      attemptCount: row._count.attempts,
      lastAttempt: row.attempts[0] ?? null,
      patient: {
        id: row.patient.id,
        patientCode: row.patient.patientCode,
        name: formatPersonName(row.patient, 'short'),
        phoneE164: row.patient.phoneE164,
        tier,
      },
    };
  }

  /** One contact for the record sheet: the patient's phone, where they live, and a next date. */
  async detail(clinicId: string, contactId: string) {
    return this.system('Open a follow-up contact', async (tx) => {
      const contact = await tx.followUpContact.findFirst({
        where: { id: contactId, clinicId },
        select: DETAIL_SELECT,
      });
      if (!contact) throw new NotFoundException();
      return this.toDetail(contact, dayOf(new Date()));
    });
  }

  /**
   * The clinic's open contacts due within the week, each with everything the record sheet needs,
   * for the device to keep and work from offline. Most urgent first, capped (see the limit).
   */
  async offlinePacket(clinicId: string) {
    const today = dayOf(new Date());
    return this.system('Prepare follow-up for offline use', async (tx) => {
      const rows = await tx.followUpContact.findMany({
        where: {
          clinicId,
          status: { in: ['DUE', 'MISSED'] },
          dueOn: { lte: addDays(today, 7) },
          patient: { mergedIntoPatientId: null },
        },
        orderBy: DUE_ORDER,
        take: OFFLINE_PACKET_LIMIT + 1,
        select: DETAIL_SELECT,
      });
      return {
        today: today.toISOString().slice(0, 10),
        items: rows.slice(0, OFFLINE_PACKET_LIMIT).map((row) => this.toDetail(row, today)),
        truncated: rows.length > OFFLINE_PACKET_LIMIT,
      };
    });
  }

  private toDetail(contact: DetailRow, today: Date) {
    const { patient } = contact;
    const assessment = patient.currentRiskAssessment;
    // The date the tier gives if this contact is completed now: the sheet's editable default.
    const next = assessment
      ? nextContact({
          tier: assessment.tier,
          atTarget: assessment.atTarget,
          actions: assessment.actions as FollowUpAction[],
          lastInPersonAt: isInPerson(contact.mode)
            ? new Date()
            : (patient.encounters[0]?.createdAt ?? null),
          lastTeleAt: isInPerson(contact.mode) ? null : new Date(),
          today: new Date(),
        })
      : null;
    const suggested = isInPerson(contact.mode) ? next?.inPersonDueAt : next?.teleDueAt;
    const recorded = patient.residentialLocationStatus === 'RECORDED';
    const snapshot = (assessment?.inputSnapshot ?? {}) as {
      conditions?: string[] | null;
      glucose?: unknown;
    };
    return {
      ...this.toItem(contact, today),
      suggestedNextOn: suggested ? dayOf(suggested).toISOString().slice(0, 10) : null,
      // Known diabetes, or a glucose on record: worth asking the diabetes danger signs too.
      asksDiabetes: !!snapshot.conditions?.includes('DIABETES') || snapshot.glucose != null,
      location: recorded
        ? {
            community: patient.residentialCommunity,
            digitalAddress: patient.residentialDigitalAddress,
            landmark: patient.residentialLandmark,
            latitude: patient.residentialLatitude?.toNumber() ?? null,
            longitude: patient.residentialLongitude?.toNumber() ?? null,
          }
        : null,
    };
  }

  /** A patient's open contacts and every attempt, newest first, for the chart. */
  async forPatient(clinicId: string, patientId: string) {
    return this.system('Read a patient follow-up history', async (tx) => {
      const [open, attempts] = await Promise.all([
        tx.followUpContact.findMany({
          where: { clinicId, patientId, status: { in: ['DUE', 'MISSED'] } },
          orderBy: { dueOn: 'asc' },
          select: {
            id: true,
            mode: true,
            purpose: true,
            status: true,
            dueOn: true,
            owner: { select: { id: true, displayName: true } },
          },
        }),
        tx.followUpAttempt.findMany({
          where: { clinicId, patientId },
          orderBy: { at: 'desc' },
          take: 50,
          select: {
            id: true,
            at: true,
            mode: true,
            outcome: true,
            notReachedReason: true,
            referralDestination: true,
            by: { select: { id: true, displayName: true } },
            contact: { select: { purpose: true } },
          },
        }),
      ]);
      return {
        open: open.map((c) => ({ ...c, dueOn: c.dueOn.toISOString().slice(0, 10) })),
        attempts,
      };
    });
  }

  /** Take a contact, or hand it to a colleague who can do follow-up at this clinic. */
  async take(clinicId: string, contactId: string, actorUserId: string, ownerUserId?: string) {
    const owner = ownerUserId ?? actorUserId;
    return this.system('Take a follow-up contact', async (tx) => {
      if (owner !== actorUserId) {
        const eligible = await tx.userClinicRole.findFirst({
          where: {
            userId: owner,
            clinicId,
            role: { in: MANAGE_ROLES as never },
            user: { isActive: true },
          },
          select: { userId: true },
        });
        if (!eligible) {
          throw new BadRequestException('That person cannot take follow-up work at this clinic.');
        }
      }
      const { count } = await tx.followUpContact.updateMany({
        where: { id: contactId, clinicId, status: { in: ['DUE', 'MISSED'] } },
        data: { ownerUserId: owner },
      });
      if (count === 0) throw new ConflictException('This contact is no longer open.');
      await this.audit.logWrite(
        {
          clinicId,
          actorUserId,
          action: 'FOLLOW_UP_CONTACT_TAKEN',
          entityType: 'FollowUpContact',
          entityId: contactId,
          beforeJson: null,
          afterJson: JSON.stringify({ ownerUserId: owner }),
        },
        tx,
      );
      return tx.user.findUniqueOrThrow({
        where: { id: owner },
        select: { id: true, displayName: true },
      });
    });
  }

  /**
   * Record one attempt. Reaching the patient (any outcome but ATTEMPTED) completes the contact,
   * and the recompute that follows books the next one. A danger sign starts the Urgent pathway.
   *
   * `dto.id` is made on the device, so the same attempt sent twice (a retry, or a request that
   * landed before the connection dropped and was then queued) is recorded once. `replay` is the
   * offline outbox (#338): the attempt is dated when it happened, and is kept even when the contact
   * was closed meanwhile, because the call still happened; it just completes nothing.
   */
  async recordAttempt(
    clinicId: string,
    contactId: string,
    actorUserId: string,
    dto: RecordFollowUpAttemptDto,
    replay?: { at: Date },
  ) {
    if (dto.id) {
      const existing = await this.system('Check for a repeated follow-up attempt', (tx) =>
        tx.followUpAttempt.findUnique({
          where: { id: dto.id },
          select: { id: true, at: true, outcome: true, contactId: true, clinicId: true },
        }),
      );
      if (existing) {
        if (existing.clinicId !== clinicId || existing.contactId !== contactId) {
          throw new ConflictException('That attempt id belongs to another contact.');
        }
        return {
          id: existing.id,
          at: existing.at,
          outcome: existing.outcome,
          contactStatus: existing.outcome === 'ATTEMPTED' ? 'DUE' : 'DONE',
          urgent: false,
        };
      }
    }
    const reported = dto.reportedSystolicBp != null || dto.reportedDiastolicBp != null;
    if (reported && (dto.reportedSystolicBp == null || dto.reportedDiastolicBp == null)) {
      throw new BadRequestException('Enter both numbers of the reading, or neither.');
    }
    const today = dayOf(new Date());
    const nextOn = dto.nextContactOn ? dayOf(new Date(dto.nextContactOn)) : null;
    if (nextOn && (nextOn < today || nextOn > addDays(today, 366))) {
      throw new BadRequestException('Choose a next contact date within the coming year.');
    }
    const reached = dto.outcome !== 'ATTEMPTED';

    const saved = await this.system('Record a follow-up attempt', async (tx) => {
      const contact = await tx.followUpContact.findFirst({
        where: { id: contactId, clinicId },
        select: { id: true, patientId: true, ownerUserId: true, status: true },
      });
      if (!contact) throw new NotFoundException();
      const open = contact.status === 'DUE' || contact.status === 'MISSED';
      if (!open && !replay) throw new ConflictException('This contact is no longer open.');
      const now = replay?.at ?? new Date();
      const measurement = reported
        ? await tx.patientMeasurement.create({
            data: {
              clinicId,
              patientId: contact.patientId,
              recordedAt: now,
              source: 'PATIENT',
              type: 'BP',
              payloadJson: JSON.stringify({
                systolic: dto.reportedSystolicBp,
                diastolic: dto.reportedDiastolicBp,
              }),
              notes: 'Reported on a follow-up contact',
            },
            select: { id: true },
          })
        : null;
      const attempt = await tx.followUpAttempt.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          clinicId,
          contactId,
          patientId: contact.patientId,
          at: now,
          byUserId: actorUserId,
          mode: dto.mode,
          outcome: dto.outcome,
          notReachedReason: reached ? null : dto.notReachedReason,
          closingSteps: reached ? (dto.closingSteps ?? []) : [],
          symptoms: (dto.symptoms ?? []).filter((symptom) => symptom !== 'NONE'),
          diabetesSymptoms: (dto.diabetesSymptoms ?? []).filter((symptom) => symptom !== 'NONE'),
          adherence: dto.adherence ?? null,
          measurementId: measurement?.id ?? null,
          referralDestination: dto.referralDestination ?? null,
          notes: dto.notes ?? null,
        },
        select: { id: true, at: true, outcome: true },
      });
      if (open) {
        await tx.followUpContact.update({
          where: { id: contactId },
          data: {
            ownerUserId: contact.ownerUserId ?? actorUserId,
            ...(reached ? { status: 'DONE' as FollowUpContactStatus, completedAt: now } : {}),
          },
        });
      }
      if (dto.outcome === 'REFERRED') {
        await tx.followUpContact.create({
          data: {
            clinicId,
            patientId: contact.patientId,
            mode: 'PHONE',
            purpose: 'REFERRAL_CONFIRMATION',
            dueOn: addDays(dayOf(now), DEFAULT_FOLLOW_UP_CONFIG.referralConfirmationDays),
            tierAtScheduling:
              (
                await tx.patient.findUnique({
                  where: { id: contact.patientId },
                  select: { currentRiskTier: true },
                })
              )?.currentRiskTier ?? 'NOT_TIERED',
            ownerUserId: actorUserId,
          },
        });
      }
      await this.audit.logWrite(
        {
          clinicId,
          actorUserId,
          action: 'FOLLOW_UP_ATTEMPT_RECORDED',
          entityType: 'FollowUpAttempt',
          entityId: attempt.id,
          beforeJson: null,
          afterJson: JSON.stringify({
            contactId,
            mode: dto.mode,
            outcome: dto.outcome,
            ...(replay ? { queuedOffline: true } : {}),
          }),
        },
        tx,
      );
      return { attempt, patientId: contact.patientId, completes: open && reached };
    });

    // A danger sign or a crisis reading reported by phone: the same urgent flag as screening.
    const findings = phoneFindings(dto);
    if (findings.length > 0) {
      this.flags.alertScreening({
        clinicId,
        patientId: saved.patientId,
        attemptId: saved.attempt.id,
        actorUserId,
        findings,
      });
    }

    // The tier sees the new contact (and any reported reading) and books the next contact.
    // Detached: a recompute opens its own system context, which cannot nest in the request's.
    await this.prisma
      .detachFromRlsContext(() =>
        this.risk.recompute({
          patientId: saved.patientId,
          trigger: 'FOLLOW_UP_CONTACT',
          actorUserId,
        }),
      )
      .catch((error) =>
        this.logger.warn(`Recompute after a contact failed: ${error?.name ?? 'unknown error'}`),
      );
    if (saved.completes && nextOn) await this.setNextDate(clinicId, contactId, nextOn);
    return {
      id: saved.attempt.id,
      at: saved.attempt.at,
      outcome: saved.attempt.outcome,
      contactStatus: reached ? 'DONE' : 'DUE',
      urgent: findings.length > 0,
    };
  }

  /** The date agreed with the patient replaces the tier's for the next contact of the same kind. */
  private async setNextDate(clinicId: string, contactId: string, dueOn: Date) {
    await this.system('Set the agreed next follow-up date', async (tx) => {
      const done = await tx.followUpContact.findUniqueOrThrow({
        where: { id: contactId },
        select: { patientId: true, mode: true },
      });
      const next = await tx.followUpContact.findMany({
        where: {
          clinicId,
          patientId: done.patientId,
          status: 'DUE',
          purpose: { in: ['ROUTINE', 'CONFIRM_READING', 'RESCREEN', 'REMINDER_BEFORE_VISIT'] },
        },
        orderBy: { dueOn: 'asc' },
        select: { id: true, mode: true },
      });
      const same = next.find((c) => isInPerson(c.mode) === isInPerson(done.mode));
      if (same) await tx.followUpContact.update({ where: { id: same.id }, data: { dueOn } });
    });
  }

  /**
   * Cancel with a reason. Died, moved or opted out cancels every open contact the patient has,
   * and the scheduler books no more until they are next seen in person.
   */
  async cancel(
    clinicId: string,
    contactId: string,
    actorUserId: string,
    dto: CancelFollowUpContactDto,
  ) {
    await this.system('Cancel a follow-up contact', async (tx) => {
      const contact = await tx.followUpContact.findFirst({
        where: { id: contactId, clinicId, status: { in: ['DUE', 'MISSED'] } },
        select: { patientId: true },
      });
      if (!contact) throw new ConflictException('This contact is no longer open.');
      const now = new Date();
      await tx.followUpContact.updateMany({
        where: STOPPING_REASONS.has(dto.reason)
          ? { clinicId, patientId: contact.patientId, status: { in: ['DUE', 'MISSED'] } }
          : { id: contactId },
        data: { status: 'CANCELLED', cancelledAt: now, cancelReason: dto.reason },
      });
      await this.audit.logWrite(
        {
          clinicId,
          actorUserId,
          action: 'FOLLOW_UP_CONTACT_CANCELLED',
          entityType: 'FollowUpContact',
          entityId: contactId,
          beforeJson: null,
          afterJson: JSON.stringify({ reason: dto.reason }),
        },
        tx,
      );
    });
    return { status: 'CANCELLED' as const };
  }
}

/**
 * The urgent findings in what the patient said on a call, in plain words: hypertension danger
 * signs and a crisis reading, and the diabetes danger signs, by the screening forms' own rules.
 */
export function phoneFindings(
  dto: Pick<
    RecordFollowUpAttemptDto,
    'symptoms' | 'diabetesSymptoms' | 'reportedSystolicBp' | 'reportedDiastolicBp'
  >,
): string[] {
  const hypertension = deriveHypertensionEscalation({
    symptoms: dto.symptoms ?? [],
    systolicBp: dto.reportedSystolicBp ?? null,
    diastolicBp: dto.reportedDiastolicBp ?? null,
  });
  const diabetes = deriveDiabetesEscalation({ urgentSymptoms: dto.diabetesSymptoms ?? [] });
  return [
    ...hypertension.reasons.map((reason) => HYPERTENSION_ESCALATION_REASON_LABELS[reason]),
    ...diabetes.reasons.map((reason) => DIABETES_ESCALATION_REASON_LABELS[reason]),
  ];
}
