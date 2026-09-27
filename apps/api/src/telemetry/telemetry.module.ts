import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TelemetryInterceptor } from './telemetry.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { TelemetryService } from './telemetry.service';
import {
  TELEMETRY_MAINTENANCE_QUEUE,
  TelemetryRetentionProcessor,
} from './telemetry-retention.processor';

/** Global, like AuditModule: any module may record an event without importing this one. */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: TELEMETRY_MAINTENANCE_QUEUE })],
  controllers: [MetricsController],
  providers: [
    TelemetryService,
    MetricsService,
    TelemetryRetentionProcessor,
    { provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor },
  ],
  exports: [TelemetryService],
})
export class TelemetryModule {}
