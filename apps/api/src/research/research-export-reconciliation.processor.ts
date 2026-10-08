import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { redactLogValue } from '../common/redaction';
import { ResearchExportService } from './research-export.service';

export const RESEARCH_EXPORT_RECONCILIATION_QUEUE = 'research-export-reconciliation';
export const RESEARCH_EXPORT_RECONCILE_JOB = 'reconcile-stale-exports';

/** Every fifteen minutes; an export is stale after an hour (RESEARCH_EXPORT_STALE_AFTER_MS). */
export const RESEARCH_EXPORT_RECONCILE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Settles research exports whose worker never finished (#164); see
 * `ResearchExportService.reconcileStaleExports`. Finding them crosses clinics and runs under
 * system context; each one is settled under its own clinic's context, after asking GitHub with no
 * transaction open.
 */
@Processor(RESEARCH_EXPORT_RECONCILIATION_QUEUE)
export class ResearchExportReconciliationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ResearchExportReconciliationProcessor.name);

  constructor(
    @InjectQueue(RESEARCH_EXPORT_RECONCILIATION_QUEUE) private readonly queue: Queue,
    private readonly researchExportService: ResearchExportService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        RESEARCH_EXPORT_RECONCILE_JOB,
        { every: RESEARCH_EXPORT_RECONCILE_INTERVAL_MS },
        { name: RESEARCH_EXPORT_RECONCILE_JOB },
      );
    } catch (err) {
      // Redis must not be in the blast radius of API boot. Without the sweep a lost push keeps
      // reading PROCESSING, which nothing restarts, so the cost is a stale label, not a duplicate.
      this.logger.error(
        JSON.stringify({
          message: 'Research export reconciliation sweep could not be scheduled',
          error: redactLogValue(err),
        }),
      );
    }
  }

  async process(): Promise<void> {
    const requestId = RESEARCH_EXPORT_RECONCILE_JOB;
    await this.tenantContext.runSystemJobSteps(
      {
        queueName: RESEARCH_EXPORT_RECONCILIATION_QUEUE,
        resourceId: RESEARCH_EXPORT_RECONCILE_JOB,
        systemReason: 'Find research exports whose run never finished',
      },
      (systemStep) =>
        this.researchExportService.reconcileStaleExports(systemStep, (clinicId) =>
          this.tenantContext.clinicStep(clinicId, requestId),
        ),
    );
  }
}
