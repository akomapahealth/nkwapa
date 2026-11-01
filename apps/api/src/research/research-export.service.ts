import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import type {
  ResearchExportStatus,
  ResearchExportTrigger,
  ResearchStorageProvider,
} from '@prisma/client';
import { CLINIC_DEFAULT_TIMEZONE, todayInTimeZone } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  RESEARCH_DATASET_VERSION,
  RESEARCH_EXPORT_QUEUE_NAME,
  RESEARCH_FILE_FORMAT,
  RESEARCH_POLICY_VERSION,
  type GeneratedResearchPack,
  type ResearchRunChanges,
} from './research-policy';
import { existsSync } from 'fs';
import {
  ResearchExportRecord,
  ResearchExportRepository,
  type ResearchExportListFilter,
} from './research-export.repository';
import { RequestExportDto } from './dto/request-export.dto';
import { ResearchTransformService } from './research-transform.service';
import { DeIdentificationService } from './de-identification.service';
import { ResearchStorageRegistry } from './storage/research-storage.registry';
import type {
  ResearchRunPackage,
  ResearchStorageAdapter,
  StoredRunRef,
} from './storage/research-storage.port';
import { adHocRunKey, baseRunKey, revisionRunKey } from './research-run-key';
import { researchMinSubjects, runSkipReason } from './research-run-governance';
import { ResearchRunNotifier } from './research-run.notifier';
import { redactLogValue } from '../common/redaction';
import { SINGLE_FINAL_ATTEMPT, hasAttemptsLeft, type JobAttempt } from '../common/job-attempt';
import { lockForTransaction, tryLockForTransaction } from '../prisma/transaction-lock';
import type { JobStep } from '../prisma/job-tenant-context.runner';
import { RedisService } from '../redis/redis.service';

export interface ExportAuditContext {
  clinicId: string;
  actorUserId: string;
  requestId?: string;
}

export interface ResearchExportView {
  id: string;
  clinicId: string;
  runKey: string;
  trigger: ResearchExportTrigger;
  scheduleId: string | null;
  status: ResearchExportStatus;
  fromDate: string;
  toDate: string;
  datasetVersion: number;
  policyVersionSnapshot: string;
  rejectionReason: string | null;
  failureReason: string | null;
  skipReason: string | null;
  filePath: string | null;
  /**
   * Whether the zip is still on this server. It lives on the API's own disk, which a redeploy or
   * restart can wipe; the published run in storage outlives it.
   */
  downloadAvailable: boolean;
  fileFormat: string | null;
  recordCount: number | null;
  rowCounts: Record<string, number>;
  consentedSubjectCount: number | null;
  revokedSinceLastCount: number | null;
  contentSha256: string | null;
  changes: ResearchRunChanges | null;
  artifactSha256: string | null;
  artifactSizeBytes: number | null;
  storageProvider: ResearchStorageProvider | null;
  storagePath: string | null;
  storageRef: string | null;
  storageUrl: string | null;
  requestedAt: string;
  startedAt: string | null;
  approvedAt: string | null;
  syncedAt: string | null;
  completedAt: string | null;
  requestedBy?: { id: string; displayName: string };
  approvedBy?: { id: string; displayName: string } | null;
}

/** Everything that makes a run, however it was asked for. */
export interface CreateRunParams {
  clinicId: string;
  requestedByUserId: string;
  /** Set for a run that needs no further approval; it is queued at once. */
  approvedByUserId: string | null;
  fromDate: string;
  toDate: string;
  runKey: string;
  trigger: ResearchExportTrigger;
  scheduleId: string | null;
  storageProvider: ResearchStorageProvider;
}

const RESEARCH_EXPORT_FAILED = 'RESEARCH_EXPORT_FAILED';
/** A run that stopped before it published anything: safe for an operator to retry. */
export const RESEARCH_EXPORT_INTERRUPTED = 'RESEARCH_EXPORT_INTERRUPTED';
/**
 * Pack generation reads a clinic's whole date range, and a big clinic can take longer than the
 * default five seconds. It is reads only, so a longer transaction holds nothing that matters, and
 * a timeout costs a retry, never a duplicate publish.
 */
const RESEARCH_PACK_TRANSACTION_TIMEOUT_MS = 120_000;
/** Generation plus a publish of up to 250 MB is minutes; an hour is never a live run. */
export const RESEARCH_EXPORT_STALE_AFTER_MS = 60 * 60 * 1000;
const RESEARCH_RECONCILE_BATCH = 50;

type ClaimOutcome =
  | { done: ResearchExportView }
  | { skipped: ResearchExportRecord; actorUserId: string }
  | { processing: ResearchExportRecord; actorUserId: string }
  | null;

@Injectable()
export class ResearchExportService {
  private readonly logger = new Logger(ResearchExportService.name);

  constructor(
    private readonly repo: ResearchExportRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly transformService: ResearchTransformService,
    private readonly storage: ResearchStorageRegistry,
    private readonly deIdService: DeIdentificationService,
    private readonly notifier: ResearchRunNotifier,
    @InjectQueue(RESEARCH_EXPORT_QUEUE_NAME)
    private readonly exportQueue: Queue,
    private readonly redis: RedisService,
  ) {}

  async requestExport(
    clinicId: string,
    userId: string,
    dto: RequestExportDto,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const settings = await this.prisma.clinicResearchSettings.findUnique({
      where: { clinicId },
    });

    if (!settings?.researchEnabled) {
      throw new BadRequestException('Research is not enabled for this clinic');
    }

    this.assertDateRange(dto.fromDate, dto.toDate);
    const storageProvider = this.storage.defaultProvider();
    this.storage.assertAvailable(storageProvider);

    const record = await this.createRun(
      {
        clinicId,
        requestedByUserId: userId,
        approvedByUserId: settings.requiresDirectorApprovalEachExport ? null : userId,
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        runKey: await this.adHocRunKey(clinicId),
        trigger: 'MANUAL',
        scheduleId: null,
        storageProvider,
      },
      auditCtx,
    );
    return this.toExportView(record);
  }

  /**
   * Create a run and, when it is already approved, queue it under its run key (#166). The single
   * path for manual requests, schedule runs, Run now and reruns, so they cannot drift apart.
   */
  async createRun(
    params: CreateRunParams,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportRecord> {
    const approver = params.approvedByUserId;
    const record = await this.repo.create({
      clinic: { connect: { id: params.clinicId } },
      requestedBy: { connect: { id: params.requestedByUserId } },
      fromDate: params.fromDate,
      toDate: params.toDate,
      runKey: params.runKey,
      trigger: params.trigger,
      schedule: params.scheduleId ? { connect: { id: params.scheduleId } } : undefined,
      storageProvider: params.storageProvider,
      status: approver ? 'APPROVED' : 'PENDING_APPROVAL',
      datasetVersion: RESEARCH_DATASET_VERSION,
      policyVersionSnapshot: RESEARCH_POLICY_VERSION,
      fileFormat: RESEARCH_FILE_FORMAT,
      approvedAt: approver ? new Date() : undefined,
      approvedBy: approver ? { connect: { id: approver } } : undefined,
    });

    await this.auditService.logWrite({
      clinicId: params.clinicId,
      actorUserId: auditCtx?.actorUserId ?? params.requestedByUserId,
      action: 'RESEARCH_EXPORT.REQUEST',
      entityType: 'ResearchExport',
      entityId: record.id,
      afterJson: JSON.stringify(record),
      requestId: auditCtx?.requestId ?? record.runKey,
    });

    if (approver) {
      await this.auditApprove(record, approver, auditCtx);
      await this.queueExport(record, approver, auditCtx);
    }
    return record;
  }

  /** The run with this key, if one exists: what makes a duplicate trigger a no-op. */
  async findByRunKey(runKey: string): Promise<ResearchExportRecord | null> {
    return this.repo.findByRunKey(runKey);
  }

  async findById(id: string): Promise<ResearchExportView | null> {
    const record = await this.repo.findById(id);
    return record ? this.toExportView(record) : null;
  }

  async findRecordById(id: string): Promise<ResearchExportRecord | null> {
    return this.repo.findById(id);
  }

  async listByClinic(
    clinicId: string,
    cursor?: string,
    limit?: number,
    filter?: ResearchExportListFilter,
  ) {
    const records = await this.repo.listByClinic(clinicId, cursor, limit, filter);
    return {
      items: records.items.map((item) => this.toExportView(item)),
      nextCursor: records.nextCursor,
    };
  }

  async approveExport(
    exportId: string,
    approverUserId: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Cannot approve: export status is ${existing.status}`);
    }

    const updated = await this.repo.update(exportId, {
      status: 'APPROVED',
      approvedBy: { connect: { id: approverUserId } },
      approvedAt: new Date(),
      failureReason: null,
      rejectionReason: null,
    });

    await this.auditApprove(updated, approverUserId, auditCtx, existing);
    await this.queueExport(updated, approverUserId, auditCtx);

    return this.toExportView(updated);
  }

  async rejectExport(
    exportId: string,
    _approverUserId: string,
    reason: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Cannot reject: export status is ${existing.status}`);
    }

    const updated = await this.repo.update(exportId, {
      status: 'REJECTED',
      rejectionReason: reason.trim(),
      failureReason: null,
    });

    if (auditCtx) {
      await this.auditService.logWrite({
        clinicId: auditCtx.clinicId,
        actorUserId: auditCtx.actorUserId,
        action: 'RESEARCH_EXPORT.REJECT',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditCtx.requestId,
      });
    }

    return this.toExportView(updated);
  }

  async retryExport(
    exportId: string,
    userId: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'FAILED') {
      throw new BadRequestException(`Cannot retry: export status is ${existing.status}`);
    }

    const updated = await this.repo.update(exportId, {
      status: 'APPROVED',
      failureReason: null,
      startedAt: null,
      completedAt: null,
      syncedAt: null,
      storagePath: null,
      storageRef: null,
      storageUrl: null,
    });

    if (auditCtx) {
      await this.auditService.logWrite({
        clinicId: auditCtx.clinicId,
        actorUserId: auditCtx.actorUserId,
        action: 'RESEARCH_EXPORT.RETRY',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditCtx.requestId,
      });
    }

    // A fresh job id, because BullMQ keeps a finished job under its id and silently ignores an
    // add that reuses it. Retry used to re-add under the export's own id, so the row went back to
    // APPROVED while nothing was queued to run it.
    await this.queueExport(updated, userId, auditCtx, `${updated.runKey}-retry-${Date.now()}`);
    return this.toExportView(updated);
  }

  /**
   * A deliberate rerun of a finished run's period, after a fix (#166). It gets the next `-r<n>`
   * revision of the run key, so it never collides with the original, and the reason is audited.
   */
  async rerunExport(
    exportId: string,
    userId: string,
    reason: string,
    auditCtx: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (!['COMPLETED', 'SKIPPED', 'FAILED'].includes(existing.status)) {
      throw new BadRequestException(`Cannot rerun: export status is ${existing.status}`);
    }
    const base = baseRunKey(existing.runKey);
    // Serialises two directors rerunning one period, so both cannot pick the same revision.
    await lockForTransaction(this.prisma, `research-run-revision:${base}`);
    const revisions = await this.repo.listRunKeysWithPrefix(existing.clinicId, base);
    const highest = revisions.reduce((max, key) => {
      const match = /-r(\d+)$/.exec(key);
      return Math.max(max, match ? Number(match[1]) : 1);
    }, 1);

    const created = await this.createRun(
      {
        clinicId: existing.clinicId,
        requestedByUserId: userId,
        approvedByUserId: userId,
        fromDate: existing.fromDate,
        toDate: existing.toDate,
        runKey: revisionRunKey(base, highest + 1),
        trigger: existing.trigger,
        scheduleId: existing.scheduleId,
        storageProvider: existing.storageProvider ?? this.storage.defaultProvider(),
      },
      auditCtx,
    );
    await this.auditService.logWrite({
      clinicId: auditCtx.clinicId,
      actorUserId: auditCtx.actorUserId,
      action: 'RESEARCH_EXPORT.RERUN',
      entityType: 'ResearchExport',
      entityId: created.id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify({ ...created, rerunReason: reason.trim() }),
      requestId: auditCtx.requestId ?? created.runKey,
    });
    return this.toExportView(created);
  }

  /**
   * Build an approved run's pack and publish it to its destination (#164, #166).
   *
   * Short steps, never one transaction around the upload:
   *
   * 1. **Claim**: APPROVED -> PROCESSING, committed, after the run-time governance checks; a run
   *    that fails one is recorded SKIPPED with its reason instead. A duplicate delivery, or a
   *    retry while this run is in flight, finds PROCESSING and stands down.
   * 2. **Generate** the pack in a read step of its own, which may take longer than a write
   *    should, because reading twice is harmless.
   * 3. **Plan**: record the pack and the storage path it will be published to.
   * 4. **Publish** to storage, with no transaction open. This moves the clinic's pointer too.
   * 5. **Record** COMPLETED, then mirror the manifest to GitHub if configured.
   *
   * If the publish, or recording it, fails, the planned path is what settles it: a run stored
   * there means it landed, and the export completes without publishing again. If storage cannot
   * be asked, the export stays PROCESSING and `reconcileStaleExports` asks later.
   *
   * @param attempt Where this run sits in the job's retry budget. A failure that certainly
   * published nothing, with attempts left, hands the export back (PROCESSING -> APPROVED) and
   * throws for the queue's retry. Only the last attempt records FAILED.
   * @param step Runs one transaction under the job's tenant context. The processor always passes
   * one; the default is for callers already inside a context, such as tests.
   */
  async processQueuedExport(
    exportId: string,
    attempt: JobAttempt = SINGLE_FINAL_ATTEMPT,
    step: JobStep = (callback) => callback(this.prisma),
  ): Promise<ResearchExportView | null> {
    const claim = await step(() => this.claimExport(exportId));
    if (!claim) return null;
    if ('done' in claim) return claim.done;
    if ('skipped' in claim) {
      await this.notifyIfScheduled(step, claim.skipped, claim.actorUserId);
      return this.toExportView(claim.skipped);
    }
    const { processing, actorUserId } = claim;
    const adapter = this.storage.get(processing.storageProvider);

    let run: ResearchRunPackage;
    let planned: ResearchExportRecord = processing;
    try {
      const pack = await step(
        () =>
          this.transformService.generatePack(
            processing.clinicId,
            processing.fromDate,
            processing.toDate,
            exportId,
            {
              runKey: processing.runKey,
              trigger: processing.trigger,
              scheduleId: processing.scheduleId,
            },
            processing.policyVersionSnapshot,
          ),
        { timeout: RESEARCH_PACK_TRANSACTION_TIMEOUT_MS },
      );
      run = {
        exportId,
        runKey: processing.runKey,
        fromDate: processing.fromDate,
        toDate: processing.toDate,
        pack,
      };
      const storagePath = adapter.plannedPath(run);
      planned = await step(() =>
        this.repo.update(exportId, {
          ...this.packFields(pack),
          storageProvider: adapter.provider,
          storagePath,
        }),
      );
    } catch (error) {
      // Nothing has been published yet, so this is an ordinary failure.
      return this.failOrRetry(step, processing, actorUserId, attempt, error);
    }

    const storagePath = planned.storagePath as string;
    let stored: StoredRunRef;
    try {
      stored = await adapter.putRun(run);
    } catch (error) {
      const landed = await this.checkStored(adapter, exportId, storagePath);
      if (landed === 'UNKNOWN') return null;
      if (!landed) return this.failOrRetry(step, planned, actorUserId, attempt, error);
      stored = landed;
    }

    let completed: ResearchExportRecord | null;
    try {
      completed = await step(() => this.completeExport(planned, stored, actorUserId));
    } catch (error) {
      // Storage has the run. Throwing hands the job back to the queue, whose retry finds
      // PROCESSING and stands down; the sweep then finds the run and completes the export.
      this.logger.error(
        JSON.stringify({
          message: 'Research export published but COMPLETED could not be recorded',
          exportId,
          runKey: processing.runKey,
          clinicId: processing.clinicId,
          storagePath,
          storageRef: stored.ref,
          error: redactLogValue(error),
        }),
      );
      throw error;
    }
    if (completed) await this.mirrorManifest(step, completed, run, actorUserId);
    return completed ? this.toExportView(completed) : null;
  }

  /**
   * Settle exports a worker claimed and never finished (#164).
   *
   * An export still PROCESSING well after it started belongs to a worker that died, or that lost
   * track of its upload. One with no planned path never published, and fails. One with a path is
   * settled by asking storage: a stored run there completes it, none fails it. Nothing is
   * published from here, and an export storage cannot be asked about is left for the next sweep.
   */
  async reconcileStaleExports(
    systemStep: JobStep,
    clinicStep: (clinicId: string) => JobStep,
    now: Date = new Date(),
  ): Promise<{ completed: number; failed: number }> {
    const stale = await systemStep(() =>
      this.repo.findStaleProcessing(
        new Date(now.getTime() - RESEARCH_EXPORT_STALE_AFTER_MS),
        RESEARCH_RECONCILE_BATCH,
      ),
    );
    const outcome = { completed: 0, failed: 0 };
    for (const row of stale) {
      const landed = row.storagePath
        ? await this.checkStored(this.storage.get(row.storageProvider), row.id, row.storagePath)
        : null;
      if (landed === 'UNKNOWN') continue;
      const step = clinicStep(row.clinicId);
      const settled = await step(async () => {
        const current = await this.repo.findById(row.id);
        if (!current || current.status !== 'PROCESSING') return null;
        const actorUserId =
          current.approvedBy?.id ?? current.requestedBy?.id ?? current.requestedByUserId;
        if (landed) {
          return this.completeExport(current, landed, actorUserId, 'RESEARCH_EXPORT.RECONCILE');
        }
        return this.recordFailure(current, actorUserId, RESEARCH_EXPORT_INTERRUPTED);
      });
      if (!settled) continue;
      if (landed) {
        outcome.completed += 1;
      } else {
        outcome.failed += 1;
        await this.notifyIfScheduled(step, settled, settled.requestedByUserId);
      }
    }
    return outcome;
  }

  /** Step 1: take an approved export for this worker, skip it, or say why not. */
  private async claimExport(exportId: string): Promise<ClaimOutcome> {
    // Stands down cheaply when another delivery is deciding the same export. The conditional
    // transition below is what makes the claim exclusive.
    if (!(await tryLockForTransaction(this.prisma, `research-export:${exportId}`))) {
      return null;
    }

    const existing = await this.repo.findById(exportId);
    if (!existing) {
      throw new NotFoundException('Export not found');
    }
    if (existing.status === 'COMPLETED' || existing.status === 'SKIPPED') {
      return { done: this.toExportView(existing) };
    }
    if (existing.status === 'PROCESSING') {
      // In flight elsewhere, or waiting for the sweep to settle a lost upload. Never restart it.
      return null;
    }
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException(`Cannot process export with status ${existing.status}`);
    }

    const actorUserId =
      existing.approvedBy?.id ?? existing.requestedBy?.id ?? existing.requestedByUserId;
    const { skipReason, consentedSubjects } = await this.governRun(existing);
    if (skipReason) {
      const skipped = await this.repo.transition(exportId, 'APPROVED', {
        status: 'SKIPPED',
        skipReason,
        consentedSubjectCount: consentedSubjects,
        completedAt: new Date(),
      });
      if (!skipped) return null;
      await this.auditService.logWrite({
        clinicId: skipped.clinicId,
        actorUserId,
        action: 'RESEARCH_EXPORT.SKIP',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(skipped),
        requestId: skipped.runKey,
      });
      return { skipped, actorUserId };
    }

    const processing = await this.repo.transition(exportId, 'APPROVED', {
      status: 'PROCESSING',
      startedAt: new Date(),
      failureReason: null,
      rejectionReason: null,
      skipReason: null,
    });
    if (!processing) return null;

    await this.auditService.logWrite({
      clinicId: processing.clinicId,
      actorUserId,
      action: 'RESEARCH_EXPORT.START',
      entityType: 'ResearchExport',
      entityId: exportId,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(processing),
      requestId: processing.runKey,
    });
    return { processing, actorUserId };
  }

  /** The run-time checks behind a run (#166): re-read, never trusted from when it was queued. */
  private async governRun(run: ResearchExportRecord) {
    const [settings, schedule, consents] = await Promise.all([
      this.prisma.clinicResearchSettings.findUnique({ where: { clinicId: run.clinicId } }),
      run.scheduleId
        ? this.prisma.researchExportSchedule.findUnique({
            where: { id: run.scheduleId },
            select: {
              status: true,
              reviewBy: true,
              approvedBy: {
                select: {
                  isActive: true,
                  clinicRoles: { select: { clinicId: true, role: true } },
                },
              },
            },
          })
        : Promise.resolve(null),
      this.repo.consentedPatientIds(run.clinicId),
    ]);
    const skipReason = runSkipReason({
      clinicId: run.clinicId,
      researchEnabled: Boolean(settings?.researchEnabled),
      schedule: run.scheduleId
        ? {
            // A schedule deleted from under its run counts as inactive.
            status: schedule?.status ?? 'REVOKED',
            reviewBy: schedule?.reviewBy ?? null,
            approver: schedule?.approvedBy
              ? { isActive: schedule.approvedBy.isActive, roles: schedule.approvedBy.clinicRoles }
              : null,
          }
        : null,
      consentedSubjects: consents.length,
      minSubjects: researchMinSubjects(),
      now: new Date(),
    });
    return { skipReason, consentedSubjects: consents.length };
  }

  /**
   * Whether the run planned at this path reached storage: its reference, null for "certainly
   * not", or UNKNOWN when storage could not be asked.
   */
  private async checkStored(
    adapter: ResearchStorageAdapter,
    exportId: string,
    storagePath: string,
  ): Promise<StoredRunRef | null | 'UNKNOWN'> {
    try {
      return await adapter.recoverRun(storagePath);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          message: 'Research export publish outcome unknown; left for reconciliation',
          exportId,
          storagePath,
          error: redactLogValue(error),
        }),
      );
      return 'UNKNOWN';
    }
  }

  /** Step 5, and the sweep's success path: PROCESSING -> COMPLETED with where it was stored. */
  private async completeExport(
    processing: ResearchExportRecord,
    stored: StoredRunRef,
    actorUserId: string,
    action: 'RESEARCH_EXPORT.COMPLETE' | 'RESEARCH_EXPORT.RECONCILE' = 'RESEARCH_EXPORT.COMPLETE',
  ): Promise<ResearchExportRecord | null> {
    const completed = await this.repo.transition(processing.id, 'PROCESSING', {
      status: 'COMPLETED',
      completedAt: new Date(),
      storageProvider: stored.provider,
      storagePath: stored.path,
      storageRef: stored.ref,
      storageUrl: stored.url,
      syncedAt: stored.syncedAt,
    });
    if (!completed) return null;
    await this.auditService.logWrite({
      clinicId: completed.clinicId,
      actorUserId,
      action,
      entityType: 'ResearchExport',
      entityId: completed.id,
      beforeJson: JSON.stringify(processing),
      afterJson: JSON.stringify(completed),
      requestId: completed.runKey,
    });
    return completed;
  }

  /**
   * Copy the manifest and change summary to GitHub when the data went elsewhere (#166). Best
   * effort: the run is already published, so a failed mirror is audited, not retried.
   */
  private async mirrorManifest(
    step: JobStep,
    completed: ResearchExportRecord,
    run: ResearchRunPackage,
    actorUserId: string,
  ): Promise<void> {
    if (!completed.storageProvider || !this.storage.mirrorsManifests(completed.storageProvider)) {
      return;
    }
    let mirrored: StoredRunRef | null = null;
    let failure: unknown = null;
    try {
      mirrored = await this.storage.github.mirrorManifest(run);
    } catch (error) {
      failure = error;
      this.logger.warn(
        JSON.stringify({
          message: 'Research run manifest could not be mirrored to GitHub',
          runKey: completed.runKey,
          error: redactLogValue(error),
        }),
      );
    }
    await step(() =>
      this.auditService.logWrite({
        clinicId: completed.clinicId,
        actorUserId,
        action: failure ? 'RESEARCH_EXPORT.MIRROR_FAIL' : 'RESEARCH_EXPORT.MIRROR',
        entityType: 'ResearchExport',
        entityId: completed.id,
        afterJson: JSON.stringify(mirrored ?? { error: String(redactLogValue(failure)) }),
        requestId: completed.runKey,
      }),
    );
  }

  /**
   * A failure that certainly published nothing. With attempts left, hand the export back to the
   * queue; on the last attempt, record FAILED and return it rather than throwing, so the operator
   * sees it and can retry.
   */
  private async failOrRetry(
    step: JobStep,
    processing: ResearchExportRecord,
    actorUserId: string,
    attempt: JobAttempt,
    error: unknown,
  ): Promise<ResearchExportView | null> {
    const willRetry = hasAttemptsLeft(attempt);
    this.logger.warn(
      JSON.stringify({
        message: willRetry
          ? 'Research export processing failed and will be retried'
          : 'Research export processing failed',
        exportId: processing.id,
        runKey: processing.runKey,
        clinicId: processing.clinicId,
        attemptsMade: attempt.attemptsMade,
        error: redactLogValue(error),
      }),
    );
    if (willRetry) {
      await step(() =>
        this.repo.transition(processing.id, 'PROCESSING', {
          status: 'APPROVED',
          storagePath: null,
        }),
      );
      throw error;
    }
    const failed = await step(() =>
      this.recordFailure(processing, actorUserId, RESEARCH_EXPORT_FAILED),
    );
    if (!failed) return null;
    await this.notifyIfScheduled(step, failed, actorUserId);
    return this.toExportView(failed);
  }

  private async recordFailure(
    processing: ResearchExportRecord,
    actorUserId: string,
    failureReason: string,
  ): Promise<ResearchExportRecord | null> {
    const failed = await this.repo.transition(processing.id, 'PROCESSING', {
      status: 'FAILED',
      failureReason,
      // A path nothing was published to would send a reader looking for a run that is not there.
      storagePath: null,
      storageRef: null,
      storageUrl: null,
      syncedAt: null,
      completedAt: null,
    });
    if (!failed) return null;
    await this.auditService.logWrite({
      clinicId: failed.clinicId,
      actorUserId,
      action: 'RESEARCH_EXPORT.FAIL',
      entityType: 'ResearchExport',
      entityId: failed.id,
      beforeJson: JSON.stringify(processing),
      afterJson: JSON.stringify(failed),
      requestId: failed.runKey,
    });
    return failed;
  }

  /** Tell the directors a scheduled run stopped short. A failed notice never fails the run. */
  private async notifyIfScheduled(
    step: JobStep,
    run: ResearchExportRecord,
    actorUserId: string,
  ): Promise<void> {
    if (run.trigger !== 'SCHEDULED') return;
    if (run.status !== 'SKIPPED' && run.status !== 'FAILED') return;
    const status = run.status;
    try {
      await step(() =>
        this.notifier.notifyDirectors(
          {
            id: run.id,
            clinicId: run.clinicId,
            runKey: run.runKey,
            status,
            reason: run.skipReason ?? run.failureReason,
          },
          actorUserId,
        ),
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'Directors could not be notified about a research run',
          runKey: run.runKey,
          error: redactLogValue(error),
        }),
      );
    }
  }

  private packFields(pack: GeneratedResearchPack) {
    return {
      filePath: pack.artifactPath,
      fileFormat: RESEARCH_FILE_FORMAT,
      recordCount: pack.recordCount,
      rowCountsJson: JSON.stringify(pack.rowCounts),
      artifactSha256: pack.artifactSha256,
      artifactSizeBytes: pack.artifactSizeBytes,
      consentedSubjectCount: pack.manifest.consentedSubjects,
      revokedSinceLastCount: pack.manifest.revokedSinceLast,
      contentSha256: pack.manifest.contentSha256,
      changesJson: JSON.stringify(pack.changes),
    };
  }

  async findExportJobTenant(
    exportId: string,
  ): Promise<{ clinicId: string; userId: string | null } | null> {
    const exportRecord = await this.repo.findById(exportId);
    if (!exportRecord) {
      return null;
    }
    return {
      clinicId: exportRecord.clinicId,
      userId: exportRecord.approvedByUserId ?? exportRecord.requestedByUserId,
    };
  }

  async recordDownload(exportId: string, auditCtx?: ExportAuditContext) {
    if (!auditCtx) {
      return;
    }
    await this.auditService.logWrite({
      clinicId: auditCtx.clinicId,
      actorUserId: auditCtx.actorUserId,
      action: 'RESEARCH_EXPORT.DOWNLOAD',
      entityType: 'ResearchExport',
      entityId: exportId,
      requestId: auditCtx.requestId,
    });
  }

  /** An ad-hoc run key for today in the clinic's own calendar. */
  async adHocRunKey(clinicId: string): Promise<string> {
    return adHocRunKey(
      this.deIdService.clinicKey(clinicId),
      todayInTimeZone(await this.clinicTimeZone(clinicId)),
    );
  }

  async clinicTimeZone(clinicId: string): Promise<string> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    return clinic?.timezone ?? CLINIC_DEFAULT_TIMEZONE;
  }

  private async queueExport(
    exportRecord: ResearchExportRecord,
    actorUserId: string,
    auditCtx?: ExportAuditContext,
    // The run key, so a duplicate trigger for one run is one job (#166).
    jobId: string = exportRecord.runKey,
  ) {
    try {
      // BullMQ waits for Redis rather than failing; a request must not wait with it (#199).
      this.redis.assertReady();
      await this.exportQueue.add(
        'process',
        {
          exportId: exportRecord.id,
          clinicId: exportRecord.clinicId,
          userId: actorUserId,
        },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      const failureReason = 'RESEARCH_EXPORT_QUEUE_FAILED';
      this.logger.warn(
        JSON.stringify({
          message: 'Research export queueing failed',
          exportId: exportRecord.id,
          runKey: exportRecord.runKey,
          clinicId: exportRecord.clinicId,
          error: redactLogValue(error),
        }),
      );
      const failed = await this.repo.update(exportRecord.id, {
        status: 'FAILED',
        failureReason,
      });
      await this.auditService.logWrite({
        clinicId: exportRecord.clinicId,
        actorUserId,
        action: 'RESEARCH_EXPORT.FAIL',
        entityType: 'ResearchExport',
        entityId: exportRecord.id,
        beforeJson: JSON.stringify(exportRecord),
        afterJson: JSON.stringify(failed),
        requestId: auditCtx?.requestId ?? exportRecord.runKey,
      });
      throw new BadRequestException(failureReason);
    }
  }

  private async auditApprove(
    updated: ResearchExportRecord,
    actorUserId: string,
    auditCtx?: ExportAuditContext,
    before?: ResearchExportRecord,
  ) {
    await this.auditService.logWrite({
      clinicId: updated.clinicId,
      actorUserId,
      action: 'RESEARCH_EXPORT.APPROVE',
      entityType: 'ResearchExport',
      entityId: updated.id,
      beforeJson: before ? JSON.stringify(before) : undefined,
      afterJson: JSON.stringify(updated),
      requestId: auditCtx?.requestId ?? updated.runKey,
    });
  }

  toExportView(record: ResearchExportRecord): ResearchExportView {
    return {
      id: record.id,
      clinicId: record.clinicId,
      runKey: record.runKey,
      trigger: record.trigger,
      scheduleId: record.scheduleId ?? null,
      status: record.status,
      fromDate: record.fromDate,
      toDate: record.toDate,
      datasetVersion: record.datasetVersion,
      policyVersionSnapshot: record.policyVersionSnapshot,
      rejectionReason: record.rejectionReason ?? null,
      failureReason: record.failureReason ?? null,
      skipReason: record.skipReason ?? null,
      filePath: record.filePath ?? null,
      downloadAvailable:
        record.status === 'COMPLETED' && Boolean(record.filePath && existsSync(record.filePath)),
      fileFormat: record.fileFormat ?? null,
      recordCount: record.recordCount ?? null,
      rowCounts: parseRowCounts(record.rowCountsJson),
      consentedSubjectCount: record.consentedSubjectCount ?? null,
      revokedSinceLastCount: record.revokedSinceLastCount ?? null,
      contentSha256: record.contentSha256 ?? null,
      changes: parseChanges(record.changesJson),
      artifactSha256: record.artifactSha256 ?? null,
      artifactSizeBytes: record.artifactSizeBytes ?? null,
      storageProvider: record.storageProvider ?? null,
      storagePath: record.storagePath ?? null,
      storageRef: record.storageRef ?? null,
      storageUrl: record.storageUrl ?? null,
      requestedAt: record.requestedAt.toISOString(),
      startedAt: record.startedAt?.toISOString() ?? null,
      approvedAt: record.approvedAt?.toISOString() ?? null,
      syncedAt: record.syncedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      requestedBy: record.requestedBy,
      approvedBy: record.approvedBy,
    };
  }

  private assertDateRange(fromDate: string, toDate: string) {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('fromDate and toDate must be valid dates');
    }
    if (to < from) {
      throw new BadRequestException('toDate must be on or after fromDate');
    }
  }
}

/** A JSON object column read back defensively: a malformed value reads as empty. */
function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseRowCounts(value: string | null): Record<string, number> {
  return Object.fromEntries(
    Object.entries(parseJsonObject(value) ?? {}).map(([key, count]) => [key, Number(count) || 0]),
  );
}

function parseChanges(value: string | null): ResearchRunChanges | null {
  return parseJsonObject(value) as ResearchRunChanges | null;
}
