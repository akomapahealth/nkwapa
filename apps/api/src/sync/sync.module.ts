import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { AuthModule } from '../auth/auth.module';
import { PatientModule } from '../patients/patient.module';
import { EncounterModule } from '../encounters/encounter.module';
import { MedicalHistoryModule } from '../medical-history/medical-history.module';
import { ClinicalMeasurementsService } from './clinical-measurements.service';
import { MedicationReconciliationModule } from '../medication-reconciliation/medication-reconciliation.module';
import { DiabetesScreeningModule } from '../diabetes-screening/diabetes-screening.module';
import { HypertensionAssessmentModule } from '../hypertension-assessment/hypertension-assessment.module';
import { MedicationAdherenceModule } from '../medication-adherence/medication-adherence.module';
import { PrescriptionModule } from '../prescriptions/prescription.module';

@Module({
  imports: [
    AuthModule,
    PatientModule,
    EncounterModule,
    MedicalHistoryModule,
    MedicationReconciliationModule,
    DiabetesScreeningModule,
    HypertensionAssessmentModule,
    MedicationAdherenceModule,
    PrescriptionModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, ClinicalMeasurementsService],
})
export class SyncModule {}
