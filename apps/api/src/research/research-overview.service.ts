import { Injectable, NotFoundException } from '@nestjs/common';
import type { ResearchExportStatus, ResearchScheduleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchExportRepository, researchExportInclude } from './research-export.repository';
import { ResearchExportService, type ResearchExportView } from './research-export.service';
import { ResearchStorageRegistry } from './storage/research-storage.registry';
import { researchMinSubjects } from './research-run-governance';
import { baseRunKey } from './research-run-key';

const DAY_MS = 86_400_000;
/** How far back a skipped or failed run still asks for a decision. */
const ATTENTION_WINDOW_DAYS = 30;
/** How early a standing approval's review date is flagged. */
const REVIEW_WARNING_DAYS = 30;
const ATTENTION_LIMIT = 20;
const EVENT_LIMIT = 100;

export type ScheduleAttentionKind = 'PENDING_APPROVAL' | 'EXPIRED' | 'REVIEW_SOON';

export interface ResearchScheduleAttention {
  id: string;
  kind: ScheduleAttentionKind;
  status: ResearchScheduleStatus;
  cadence: 'WEEKLY' | 'MONTHLY';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  localHour: number;
  reviewBy: string | null;
}

export interface ResearchOverview {
  researchEnabled: boolean;
  approvalRequired: boolean;
  timezone: string;
  consentedSubjects: number;
  minSubjects: number;
  storage: { destinations: string[]; defaultDestination: string | null };
  counts: Partial<Record<ResearchExportStatus, number>>;
  lastCompleted: ResearchExportView | null;
  nextRun: { scheduleId: string; at: string } | null;
  attention: { runs: ResearchExportView[]; schedules: ResearchScheduleAttention[] };
}

export interface ResearchRunEvent {
  id: string;
  action: string;
  at: string;
  actor: string;
  /** A reason someone recorded (rejection, rerun, skip, failure), when there is one. */
  note: string | null;
}

/**
 * What a director needs to check a clinic's research exports at a glance, and what is waiting on
 * them (#166). Read-only: every decision goes through the export and schedule services.
 */
@Injectable()
export class ResearchOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ResearchExportRepository,
    private readonly exports: ResearchExportService,
    private readonly storage: ResearchStorageRegistry,
  ) {}

  async overview(clinicId: string, now: Date = new Date()): Promise<ResearchOverview> {
    const since = new Date(now.getTime() - ATTENTION_WINDOW_DAYS * DAY_MS);
    const [
      settings,
      timezone,
      consented,
      statusCounts,
      lastCompleted,
      candidates,
      recentKeys,
      schedules,
    ] = await Promise.all([
      this.prisma.clinicResearchSettings.findUnique({ where: { clinicId } }),
      this.exports.clinicTimeZone(clinicId),
      this.repo.consentedPatientIds(clinicId),
      this.prisma.researchExport.groupBy({
        by: ['status'],
        where: { clinicId },
        _count: { _all: true },
      }),
      this.prisma.researchExport.findFirst({
        where: { clinicId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        include: researchExportInclude,
      }),
      this.prisma.researchExport.findMany({
        where: {
          clinicId,
          OR: [
            { status: 'PENDING_APPROVAL' },
            { status: { in: ['FAILED', 'SKIPPED'] }, requestedAt: { gte: since } },
          ],
        },
        orderBy: { requestedAt: 'desc' },
        take: ATTENTION_LIMIT,
        include: researchExportInclude,
      }),
      this.prisma.researchExport.findMany({
        where: { clinicId, requestedAt: { gte: since } },
        select: { runKey: true, requestedAt: true },
      }),
      this.prisma.researchExportSchedule.findMany({
        where: { clinicId, status: { not: 'REVOKED' } },
        select: {
          id: true,
          status: true,
          cadence: true,
          dayOfWeek: true,
          dayOfMonth: true,
          localHour: true,
          reviewBy: true,
          nextRunAt: true,
        },
      }),
    ]);

    // A skipped or failed run stops asking once a later revision of the same period exists.
    const superseded = (runKey: string, requestedAt: Date) =>
      recentKeys.some(
        (other) =>
          other.runKey !== runKey &&
          baseRunKey(other.runKey) === baseRunKey(runKey) &&
          other.requestedAt > requestedAt,
      );
    const runs = candidates
      .filter(
        (run) => run.status === 'PENDING_APPROVAL' || !superseded(run.runKey, run.requestedAt),
      )
      .map((run) => this.exports.toExportView(run));

    const reviewWarning = new Date(now.getTime() + REVIEW_WARNING_DAYS * DAY_MS);
    const scheduleAttention = schedules.flatMap((schedule): ResearchScheduleAttention[] => {
      const kind: ScheduleAttentionKind | null =
        schedule.status === 'PENDING_APPROVAL'
          ? 'PENDING_APPROVAL'
          : schedule.status === 'EXPIRED'
            ? 'EXPIRED'
            : schedule.status === 'ACTIVE' &&
                schedule.reviewBy &&
                schedule.reviewBy <= reviewWarning
              ? 'REVIEW_SOON'
              : null;
      if (!kind) return [];
      return [
        {
          id: schedule.id,
          kind,
          status: schedule.status,
          cadence: schedule.cadence,
          dayOfWeek: schedule.dayOfWeek,
          dayOfMonth: schedule.dayOfMonth,
          localHour: schedule.localHour,
          reviewBy: schedule.reviewBy?.toISOString() ?? null,
        },
      ];
    });

    const next = schedules
      .filter((schedule) => schedule.status === 'ACTIVE' && schedule.nextRunAt)
      .sort((a, b) => a.nextRunAt!.getTime() - b.nextRunAt!.getTime())[0];

    const destinations = this.storage.available();
    return {
      researchEnabled: Boolean(settings?.researchEnabled),
      approvalRequired: settings?.requiresDirectorApprovalEachExport ?? true,
      timezone,
      consentedSubjects: consented.length,
      minSubjects: researchMinSubjects(),
      storage: {
        destinations,
        defaultDestination: destinations.length ? this.storage.defaultProvider() : null,
      },
      counts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
      lastCompleted: lastCompleted ? this.exports.toExportView(lastCompleted) : null,
      nextRun: next ? { scheduleId: next.id, at: next.nextRunAt!.toISOString() } : null,
      attention: { runs, schedules: scheduleAttention },
    };
  }

  /** A run's own audit trail, readable by anyone who can see the run. */
  async events(clinicId: string, exportId: string): Promise<ResearchRunEvent[]> {
    const run = await this.repo.findById(exportId);
    if (!run || run.clinicId !== clinicId) throw new NotFoundException('Export not found');
    const rows = await this.prisma.auditEvent.findMany({
      where: { clinicId, entityType: 'ResearchExport', entityId: exportId },
      orderBy: { createdAt: 'asc' },
      take: EVENT_LIMIT,
      select: {
        id: true,
        action: true,
        createdAt: true,
        afterJson: true,
        actor: { select: { displayName: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      at: row.createdAt.toISOString(),
      actor: row.actor.displayName,
      note: noteFrom(row.action, row.afterJson),
    }));
  }
}

/** Only the reason fields leave the audit image; the rest of the record stays in the log. */
function noteFrom(action: string, afterJson: string | null): string | null {
  if (!afterJson) return null;
  try {
    const after = JSON.parse(afterJson) as Record<string, unknown>;
    const field =
      action === 'RESEARCH_EXPORT.RERUN'
        ? after.rerunReason
        : action === 'RESEARCH_EXPORT.REJECT'
          ? after.rejectionReason
          : action === 'RESEARCH_EXPORT.SKIP'
            ? after.skipReason
            : action === 'RESEARCH_EXPORT.FAIL'
              ? after.failureReason
              : null;
    return typeof field === 'string' && field.trim() ? field : null;
  } catch {
    return null;
  }
}
