import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { StationController } from './station.controller';
import { StationService } from './station.service';
import { ClinicDayCloseSweep } from './clinic-day-close.sweep';

@Module({
  imports: [forwardRef(() => AuthModule), AuditModule],
  controllers: [OpsController, StationController],
  providers: [OpsService, StationService, ClinicDayCloseSweep],
  exports: [OpsService, StationService],
})
export class OpsModule {}
