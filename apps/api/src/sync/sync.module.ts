import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { AuthModule } from '../auth/auth.module';
import { PatientModule } from '../patients/patient.module';
import { EncounterModule } from '../encounters/encounter.module';

@Module({
  imports: [AuthModule, PatientModule, EncounterModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
