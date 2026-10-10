import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { ResearchExportService } from './research-export.service';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';

export const RESEARCH_EXPORT_RECONCILE_JOB = 'reconcile-stale-exports';

/** Every fifteen minutes; an export is stale after an hour (RESEARCH_EXPORT_STALE_AFTER_MS). */
export const RESEARCH_EXPORT_RECONCILE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Settles research exports whose worker never finished (#164); see
 * `ResearchExportService.reconcileStaleExports`. Finding them crosses clinics and runs under
 * system context; each one is settled under its own clinic's context, after asking GitHub with no
 * transaction open.
 *
 * If it cannot be scheduled, a lost push keeps reading PROCESSING, which nothing restarts, so the
 * cost is a stale label, not a duplicate.
 */
@Injectable()
export class ResearchExportReconciliationSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = RESEARCH_EXPORT_RECONCILE_JOB;
  readonly everyMs = RESEARCH_EXPORT_RECONCILE_INTERVAL_MS;

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly researchExportService: ResearchExportService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    const requestId = RESEARCH_EXPORT_RECONCILE_JOB;
    await this.tenantContext.runSystemJobSteps(
      {
        queueName: MAINTENANCE_QUEUE,
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
