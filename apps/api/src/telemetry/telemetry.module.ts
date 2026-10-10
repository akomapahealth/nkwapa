import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TelemetryInterceptor } from './telemetry.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { TelemetryService } from './telemetry.service';
import { TelemetryRetentionSweep } from './telemetry-retention.sweep';

/** Global, like AuditModule: any module may record an event without importing this one. */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    TelemetryService,
    MetricsService,
    TelemetryRetentionSweep,
    { provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor },
  ],
  exports: [TelemetryService],
})
export class TelemetryModule {}
