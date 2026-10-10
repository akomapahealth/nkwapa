import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAINTENANCE_QUEUE, MaintenanceScheduler } from './maintenance-scheduler';
import { MaintenanceProcessor } from './maintenance.processor';

/** Global so any module can register a sweep without importing this one. */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  providers: [MaintenanceScheduler, MaintenanceProcessor],
  exports: [MaintenanceScheduler],
})
export class MaintenanceModule {}
