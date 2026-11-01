import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';
import { ResearchScheduleService } from './research-schedule.service';

export const RESEARCH_SCHEDULE_DISPATCH_JOB = 'dispatch-research-schedules';

/** Hourly: schedules fire at a local hour, so an hour is the finest grain that matters. */
export const RESEARCH_SCHEDULE_DISPATCH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * One repeatable job serves every clinic and time zone (#166). It finds due schedules under
 * system context and creates each run in that clinic's own context; the run key is the job id
 * and a unique column, so a double fire, or two API instances, still make one run per period.
 */
@Injectable()
export class ResearchScheduleDispatcher implements MaintenanceSweep, OnModuleInit {
  readonly jobName = RESEARCH_SCHEDULE_DISPATCH_JOB;
  readonly everyMs = RESEARCH_SCHEDULE_DISPATCH_INTERVAL_MS;
  private readonly logger = new Logger(ResearchScheduleDispatcher.name);

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly schedules: ResearchScheduleService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    const outcome = await this.tenantContext.runSystemJobSteps(
      {
        queueName: MAINTENANCE_QUEUE,
        resourceId: RESEARCH_SCHEDULE_DISPATCH_JOB,
        systemReason: 'Find research export schedules whose next run is due',
      },
      (systemStep) =>
        this.schedules.dispatchDue(systemStep, (clinicId, requestId) =>
          this.tenantContext.clinicStep(clinicId, requestId),
        ),
    );
    if (outcome.dispatched || outcome.duplicates || outcome.failed) {
      this.logger.log(JSON.stringify({ message: 'Research schedules dispatched', ...outcome }));
    }
  }
}
