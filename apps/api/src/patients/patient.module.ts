import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConsentModule } from '../consents/consent.module';
import { EncounterModule } from '../encounters/encounter.module';
import { PatientDuplicateRepository } from './patient-duplicate.repository';
import { PatientDuplicateService } from './patient-duplicate.service';
import { PatientRepository } from './patient.repository';
import { PatientService } from './patient.service';
import { PatientsController } from './patients.controller';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    AuditModule,
    ConsentModule,
    forwardRef(() => EncounterModule),
  ],
  providers: [
    PatientRepository,
    PatientService,
    PatientDuplicateRepository,
    PatientDuplicateService,
  ],
  controllers: [PatientsController],
  exports: [PatientService, PatientRepository, PatientDuplicateService],
})
export class PatientModule {}
