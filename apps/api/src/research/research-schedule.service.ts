import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ResearchExportSchedule, ResearchScheduleStatus } from '@prisma/client';
import { todayInTimeZone } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { lockForTransaction } from '../prisma/transaction-lock';
import type { JobStep } from '../prisma/job-tenant-context.runner';
import { redactLogValue } from '../common/redaction';
import { researchExportInclude } from './research-export.repository';
import { ResearchExportService, type ResearchExportView } from './research-export.service';
import { DeIdentificationService } from './de-identification.service';
import { ResearchStorageRegistry } from './storage/research-storage.registry';
import { addDays, nextRunAt, runWindow, scheduledRunKey } from './research-run-key';
import { researchMinSubjects } from './research-run-governance';
import type { ApproveScheduleDto, ResearchScheduleDto } from './dto/research-schedule.dto';

/** Standing approvals are looked at again after this long unless the director picks a date. */
const DEFAULT_REVIEW_MONTHS = 12;
/** And never later than this, so "forever" is not one click away. */
const MAX_REVIEW_MONTHS = 24;
const DISPATCH_BATCH = 100;

const scheduleInclude = {
  createdBy: { select: { id: true, displayName: true } },
  approvedBy: { select: { id: true, displayName: true } },
  clinic: { select: { timezone: true } },
  runs: { orderBy: { requestedAt: 'desc' }, take: 1, include: researchExportInclude },
} satisfies Prisma.ResearchExportScheduleInclude;

type ScheduleRecord = Prisma.ResearchExportScheduleGetPayload<{ include: typeof scheduleInclude }>;

export interface ResearchScheduleView {
  id: string;
  clinicId: string;
  cadence: ResearchExportSchedule['cadence'];
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  localHour: number;
  timezone: string;
  coverageStartDate: string;
  destination: ResearchExportSchedule['destination'];
  status: ResearchScheduleStatus;
  statusReason: string | null;
  reviewBy: string | null;
  createdBy: { id: string; displayName: string };
  approvedBy: { id: string; displayName: string } | null;
  approvedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRun: ResearchExportView | null;
  createdAt: string;
  updatedAt: string;
}

interface Actor {
  clinicId: string;
  userId: string;
  requestId?: string;
}

/**
 * Standing approvals for recurring research exports (#166).
 *
 * PENDING_APPROVAL -> ACTIVE <-> PAUSED -> EXPIRED (past review) / REVOKED (final). Editing an
 * approved schedule sends it back for approval when the clinic requires approval per export.
 * The dispatcher only creates runs; every run is still governed again when it starts.
 */
@Injectable()
export class ResearchScheduleService {
  private readonly logger = new Logger(ResearchScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly exports: ResearchExportService,
    private readonly deIdService: DeIdentificationService,
    private readonly storage: ResearchStorageRegistry,
  ) {}

  async list(clinicId: string) {
    const [settings, schedules, timezone] = await Promise.all([
      this.prisma.clinicResearchSettings.findUnique({ where: { clinicId } }),
      this.prisma.researchExportSchedule.findMany({
        where: { clinicId },
        include: scheduleInclude,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.exports.clinicTimeZone(clinicId),
    ]);
    return {
      items: schedules.map((schedule) => this.toView(schedule)),
      researchEnabled: Boolean(settings?.researchEnabled),
      approvalRequired: settings?.requiresDirectorApprovalEachExport ?? true,
      destinations: this.storage.available(),
      defaultDestination: this.storage.defaultProvider(),
      timezone,
      minSubjects: researchMinSubjects(),
      defaultReviewMonths: DEFAULT_REVIEW_MONTHS,
    };
  }

  async create(actor: Actor, dto: ResearchScheduleDto): Promise<ResearchScheduleView> {
    const settings = await this.requireResearchEnabled(actor.clinicId);
    const { shape, timezone } = await this.validatedShape(actor.clinicId, dto);
    // Serialises two directors creating at once, so the one-per-destination rule holds.
    await lockForTransaction(this.prisma, `research-schedule:${actor.clinicId}`);
    const clash = await this.prisma.researchExportSchedule.findFirst({
      where: {
        clinicId: actor.clinicId,
        destination: shape.destination,
        status: { not: 'REVOKED' },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `This clinic already has a ${shape.destination} schedule. Edit or revoke it instead.`,
      );
    }

    const autoApprove = !settings.requiresDirectorApprovalEachExport;
    const created = await this.prisma.researchExportSchedule.create({
      data: {
        clinicId: actor.clinicId,
        ...shape,
        createdByUserId: actor.userId,
        ...(autoApprove ? this.activation(actor.userId, shape, null, timezone) : {}),
      },
      include: scheduleInclude,
    });
    await this.audit(actor, 'RESEARCH_SCHEDULE.CREATE', created);
    return this.toView(created);
  }

  async update(
    actor: Actor,
    scheduleId: string,
    dto: ResearchScheduleDto,
  ): Promise<ResearchScheduleView> {
    const existing = await this.find(actor.clinicId, scheduleId);
    this.assertStatus(existing, ['PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'EXPIRED'], 'edit');
    const settings = await this.requireResearchEnabled(actor.clinicId);
    const { shape } = await this.validatedShape(actor.clinicId, dto);

    // A change to what is exported, or how often, is a change to what was approved.
    const reapprove = settings.requiresDirectorApprovalEachExport;
    const data: Prisma.ResearchExportScheduleUncheckedUpdateInput = reapprove
      ? {
          ...shape,
          status: 'PENDING_APPROVAL',
          statusReason: null,
          approvedByUserId: null,
          approvedAt: null,
          reviewBy: null,
          nextRunAt: null,
        }
      : {
          ...shape,
          ...(existing.status === 'ACTIVE'
            ? { nextRunAt: nextRunAt(shape, existing.clinic.timezone, new Date()) }
            : {}),
        };
    const updated = await this.prisma.researchExportSchedule.update({
      where: { id: scheduleId },
      data,
      include: scheduleInclude,
    });
    await this.audit(actor, 'RESEARCH_SCHEDULE.UPDATE', updated, existing);
    return this.toView(updated);
  }

  async approve(
    actor: Actor,
    scheduleId: string,
    dto: ApproveScheduleDto,
  ): Promise<ResearchScheduleView> {
    const existing = await this.find(actor.clinicId, scheduleId);
    this.assertStatus(existing, ['PENDING_APPROVAL', 'EXPIRED'], 'approve');
    await this.requireResearchEnabled(actor.clinicId);
    const reviewBy = this.reviewDate(dto.reviewBy);
    return this.transition(
      actor,
      existing,
      this.activation(actor.userId, existing, reviewBy, existing.clinic.timezone),
      'RESEARCH_SCHEDULE.APPROVE',
    );
  }

  async reject(actor: Actor, scheduleId: string, reason: string) {
    const existing = await this.find(actor.clinicId, scheduleId);
    this.assertStatus(existing, ['PENDING_APPROVAL'], 'reject');
    return this.transition(
      actor,
      existing,
      { status: 'REVOKED', statusReason: reason.trim(), nextRunAt: null },
      'RESEARCH_SCHEDULE.REJECT',
    );
  }

  async pause(actor: Actor, scheduleId: string) {
    const existing = await this.find(actor.clinicId, scheduleId);
    this.assertStatus(existing, ['ACTIVE'], 'pause');
    return this.transition(
      actor,
      existing,
      { status: 'PAUSED', nextRunAt: null },
      'RESEARCH_SCHEDULE.PAUSE',
    );
  }

  async resume(actor: Actor, scheduleId: string) {
    const existing = await this.find(actor.clinicId, scheduleId);
    this.assertStatus(existing, ['PAUSED'], 'resume');
    if (!existing.reviewBy || existing.reviewBy.getTime() <= Date.now()) {
      throw new BadRequestException(
        'This schedule is past its review date. A director must approve it again.',
      );
    }
    return this.transition(
      actor,
      existing,
      { status: 'ACTIVE', nextRunAt: nextRunAt(existing, existing.clinic.timezone, new Date()) },
      'RESEARCH_SCHEDULE.RESUME',
    );
  }

  async revoke(actor: Actor, scheduleId: string, reason: string) {
    const existing = await this.find(actor.clinicId, scheduleId);
    this.assertStatus(existing, ['PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'EXPIRED'], 'revoke');
    return this.transition(
      actor,
      existing,
      { status: 'REVOKED', statusReason: reason.trim(), nextRunAt: null },
      'RESEARCH_SCHEDULE.REVOKE',
    );
  }

  /**
   * An ad-hoc run under the schedule's standing approval: its coverage through yesterday, with
   * an `-a` run key, so it never takes a scheduled period's key.
   */
  async runNow(actor: Actor, scheduleId: string): Promise<ResearchExportView> {
    const schedule = await this.find(actor.clinicId, scheduleId);
    this.assertStatus(schedule, ['ACTIVE'], 'run');
    const toDate = addDays(todayInTimeZone(schedule.clinic.timezone), -1);
    const run = await this.exports.createRun(
      {
        clinicId: actor.clinicId,
        requestedByUserId: actor.userId,
        approvedByUserId: schedule.approvedByUserId ?? actor.userId,
        fromDate: schedule.coverageStartDate,
        toDate,
        runKey: await this.exports.adHocRunKey(actor.clinicId),
        trigger: 'MANUAL',
        scheduleId: schedule.id,
        storageProvider: schedule.destination,
      },
      { clinicId: actor.clinicId, actorUserId: actor.userId, requestId: actor.requestId },
    );
    await this.audit(actor, 'RESEARCH_SCHEDULE.RUN_NOW', schedule, undefined, run.runKey);
    return this.exports.toExportView(run);
  }

  /**
   * The dispatcher's work (#166): find due schedules across clinics, then, in each clinic's own
   * context, create its run under the period's run key and move the schedule on. It only reads
   * schedule rows under system context, and never a patient's.
   *
   * A schedule past its review date still gets its run, which the run-time checks then record
   * as SKIPPED (REVIEW_EXPIRED) with an email, so no period goes missing without a reason.
   */
  async dispatchDue(
    systemStep: JobStep,
    clinicStep: (clinicId: string, requestId: string) => JobStep,
    now: Date = new Date(),
  ): Promise<{ dispatched: number; duplicates: number; failed: number }> {
    const due = await systemStep(() =>
      this.prisma.researchExportSchedule.findMany({
        where: { status: 'ACTIVE', nextRunAt: { lte: now } },
        select: { id: true, clinicId: true },
        orderBy: { nextRunAt: 'asc' },
        take: DISPATCH_BATCH,
      }),
    );
    const outcome = { dispatched: 0, duplicates: 0, failed: 0 };
    for (const { id, clinicId } of due) {
      try {
        const result = await clinicStep(
          clinicId,
          `research-schedule:${id}`,
        )(() => this.dispatchOne(id, now));
        if (result === 'dispatched') outcome.dispatched += 1;
        if (result === 'duplicate') outcome.duplicates += 1;
      } catch (error) {
        // One clinic's failure must not hold up the others; the schedule stays due for next hour.
        outcome.failed += 1;
        this.logger.error(
          JSON.stringify({
            message: 'Research schedule could not be dispatched',
            scheduleId: id,
            clinicId,
            error: redactLogValue(error),
          }),
        );
      }
    }
    return outcome;
  }

  private async dispatchOne(
    scheduleId: string,
    now: Date,
  ): Promise<'dispatched' | 'duplicate' | 'not-due'> {
    await lockForTransaction(this.prisma, `research-schedule-dispatch:${scheduleId}`);
    const schedule = await this.prisma.researchExportSchedule.findUnique({
      where: { id: scheduleId },
      include: { clinic: { select: { timezone: true } } },
    });
    if (!schedule || schedule.status !== 'ACTIVE' || !schedule.nextRunAt) return 'not-due';
    if (schedule.nextRunAt.getTime() > now.getTime()) return 'not-due';

    const timezone = schedule.clinic.timezone;
    const fireAt = schedule.nextRunAt;
    const window = runWindow(schedule.coverageStartDate, fireAt, timezone);
    const runKey = scheduledRunKey(
      this.deIdService.clinicKey(schedule.clinicId),
      schedule.cadence,
      window.localDate,
    );

    // The run key is the idempotency key: a second fire, or a second API instance, finds it.
    const existing = await this.exports.findByRunKey(runKey);
    if (!existing) {
      await this.exports.createRun({
        clinicId: schedule.clinicId,
        requestedByUserId: schedule.createdByUserId,
        approvedByUserId: schedule.approvedByUserId ?? schedule.createdByUserId,
        fromDate: window.fromDate,
        toDate: window.toDate,
        runKey,
        trigger: 'SCHEDULED',
        scheduleId: schedule.id,
        storageProvider: schedule.destination,
      });
    }

    const expired = !schedule.reviewBy || schedule.reviewBy.getTime() <= now.getTime();
    const updated = await this.prisma.researchExportSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: fireAt,
        nextRunAt: expired ? null : nextRunAt(schedule, timezone, fireAt),
        ...(expired
          ? { status: 'EXPIRED', statusReason: 'The standing approval reached its review date.' }
          : {}),
      },
    });
    await this.auditService.logWrite({
      clinicId: schedule.clinicId,
      actorUserId: schedule.approvedByUserId ?? schedule.createdByUserId,
      action: expired ? 'RESEARCH_SCHEDULE.EXPIRE' : 'RESEARCH_SCHEDULE.DISPATCH',
      entityType: 'ResearchExportSchedule',
      entityId: schedule.id,
      beforeJson: JSON.stringify(schedule),
      afterJson: JSON.stringify({ ...updated, runKey }),
      requestId: runKey,
    });
    return existing ? 'duplicate' : 'dispatched';
  }

  private async transition(
    actor: Actor,
    existing: ScheduleRecord,
    data: Prisma.ResearchExportScheduleUncheckedUpdateInput,
    action: string,
  ): Promise<ResearchScheduleView> {
    // Conditional on the status read, so two directors acting at once cannot both win.
    const moved = await this.prisma.researchExportSchedule.updateMany({
      where: { id: existing.id, clinicId: actor.clinicId, status: existing.status },
      data,
    });
    if (moved.count === 0) {
      throw new ConflictException('This schedule changed while you were looking at it.');
    }
    const updated = await this.find(actor.clinicId, existing.id);
    await this.audit(actor, action, updated, existing);
    return this.toView(updated);
  }

  /** What approving sets: active, approved by whom, until when, and when it next fires. */
  private activation(
    approverUserId: string,
    shape: Pick<ResearchExportSchedule, 'cadence' | 'dayOfWeek' | 'dayOfMonth' | 'localHour'>,
    reviewBy: Date | null,
    timezone: string,
  ) {
    return {
      status: 'ACTIVE' as const,
      statusReason: null,
      approvedByUserId: approverUserId,
      approvedAt: new Date(),
      reviewBy: reviewBy ?? this.reviewDate(undefined),
      nextRunAt: nextRunAt(shape, timezone, new Date()),
    };
  }

  private async validatedShape(clinicId: string, dto: ResearchScheduleDto) {
    const timezone = await this.exports.clinicTimeZone(clinicId);
    const today = todayInTimeZone(timezone);
    if (dto.coverageStartDate >= today) {
      throw new BadRequestException('Coverage must start before today, in the clinic’s time zone.');
    }
    const destination = dto.destination ?? this.storage.defaultProvider();
    this.storage.assertAvailable(destination);
    const shape = {
      cadence: dto.cadence,
      dayOfWeek: dto.cadence === 'WEEKLY' ? (dto.dayOfWeek ?? null) : null,
      dayOfMonth: dto.cadence === 'MONTHLY' ? (dto.dayOfMonth ?? null) : null,
      localHour: dto.localHour,
      coverageStartDate: dto.coverageStartDate,
      destination,
    };
    return { shape, timezone };
  }

  private reviewDate(requested: string | undefined): Date {
    const now = new Date();
    const latest = new Date(now);
    latest.setUTCMonth(latest.getUTCMonth() + MAX_REVIEW_MONTHS);
    if (!requested) {
      const fallback = new Date(now);
      fallback.setUTCMonth(fallback.getUTCMonth() + DEFAULT_REVIEW_MONTHS);
      return fallback;
    }
    const reviewBy = new Date(requested);
    if (reviewBy.getTime() <= now.getTime() || reviewBy.getTime() > latest.getTime()) {
      throw new BadRequestException(
        `The review date must be in the future and within ${MAX_REVIEW_MONTHS} months.`,
      );
    }
    return reviewBy;
  }

  private async requireResearchEnabled(clinicId: string) {
    const settings = await this.prisma.clinicResearchSettings.findUnique({ where: { clinicId } });
    if (!settings?.researchEnabled) {
      throw new BadRequestException('Research is not enabled for this clinic');
    }
    return settings;
  }

  private async find(clinicId: string, scheduleId: string): Promise<ScheduleRecord> {
    const schedule = await this.prisma.researchExportSchedule.findFirst({
      where: { id: scheduleId, clinicId },
      include: scheduleInclude,
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  private assertStatus(
    schedule: ScheduleRecord,
    allowed: ResearchScheduleStatus[],
    verb: string,
  ): void {
    if (!allowed.includes(schedule.status)) {
      throw new BadRequestException(
        `Cannot ${verb} a schedule that is ${schedule.status.toLowerCase().replace('_', ' ')}.`,
      );
    }
  }

  private async audit(
    actor: Actor,
    action: string,
    after: ResearchExportSchedule,
    before?: ResearchExportSchedule,
    runKey?: string,
  ) {
    await this.auditService.logWrite({
      clinicId: actor.clinicId,
      actorUserId: actor.userId,
      action,
      entityType: 'ResearchExportSchedule',
      entityId: after.id,
      beforeJson: before ? JSON.stringify(withoutRelations(before)) : undefined,
      afterJson: JSON.stringify({ ...withoutRelations(after), ...(runKey ? { runKey } : {}) }),
      requestId: actor.requestId ?? runKey,
    });
  }

  private toView(schedule: ScheduleRecord): ResearchScheduleView {
    const [lastRun] = schedule.runs;
    return {
      id: schedule.id,
      clinicId: schedule.clinicId,
      cadence: schedule.cadence,
      dayOfWeek: schedule.dayOfWeek,
      dayOfMonth: schedule.dayOfMonth,
      localHour: schedule.localHour,
      timezone: schedule.clinic.timezone,
      coverageStartDate: schedule.coverageStartDate,
      destination: schedule.destination,
      status: schedule.status,
      statusReason: schedule.statusReason,
      reviewBy: schedule.reviewBy?.toISOString() ?? null,
      createdBy: schedule.createdBy,
      approvedBy: schedule.approvedBy,
      approvedAt: schedule.approvedAt?.toISOString() ?? null,
      lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
      lastRun: lastRun ? this.exports.toExportView(lastRun) : null,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    };
  }
}

/** Audit images carry the schedule's own columns, not the relations loaded for the view. */
function withoutRelations(schedule: ResearchExportSchedule): ResearchExportSchedule {
  const { id, clinicId, cadence, dayOfWeek, dayOfMonth, localHour, coverageStartDate } = schedule;
  return {
    id,
    clinicId,
    cadence,
    dayOfWeek,
    dayOfMonth,
    localHour,
    coverageStartDate,
    destination: schedule.destination,
    status: schedule.status,
    statusReason: schedule.statusReason,
    reviewBy: schedule.reviewBy,
    createdByUserId: schedule.createdByUserId,
    approvedByUserId: schedule.approvedByUserId,
    approvedAt: schedule.approvedAt,
    lastRunAt: schedule.lastRunAt,
    nextRunAt: schedule.nextRunAt,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}
