import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';
import { StationService } from './station.service';

export const CLINIC_DAY_CLOSE_JOB = 'close-stale-clinic-days';

/** Hourly, so a clinic closes within an hour of its own midnight whatever its time zone. */
export const CLINIC_DAY_CLOSE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Closes out a clinic day nobody ended by hand: check-ins still open and shifts still active
 * from before the clinic's today. If it cannot be scheduled, yesterday's patients keep sitting in
 * the line until a manager presses "End clinic day" or marks them left; nothing else depends on it.
 */
@Injectable()
export class ClinicDayCloseSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = CLINIC_DAY_CLOSE_JOB;
  readonly everyMs = CLINIC_DAY_CLOSE_INTERVAL_MS;
  private readonly logger = new Logger(ClinicDayCloseSweep.name);

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly stationService: StationService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    // Crosses every clinic, so it cannot run under any one tenant's context.
    const result = await this.tenantContext.runSystemJob(
      {
        queueName: MAINTENANCE_QUEUE,
        resourceId: CLINIC_DAY_CLOSE_JOB,
        systemReason: 'Close check-ins and shifts left open from an earlier clinic day',
      },
      (client) => this.stationService.closeStaleClinicDays(client),
    );
    if (result.checkIns || result.shifts) {
      this.logger.log(JSON.stringify({ message: 'Closed stale clinic days', ...result }));
    }
  }
}
