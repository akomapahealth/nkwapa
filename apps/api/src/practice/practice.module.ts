import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PatientModule } from '../patients/patient.module';
import { OpsModule } from '../ops/ops.module';
import { EncounterModule } from '../encounters/encounter.module';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    AuditModule,
    PatientModule,
    OpsModule,
    forwardRef(() => EncounterModule),
  ],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
