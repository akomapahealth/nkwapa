import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MedicationReconciliationController } from './medication-reconciliation.controller';
import { MedicationReconciliationService } from './medication-reconciliation.service';

@Module({
  imports: [AuditModule],
  controllers: [MedicationReconciliationController],
  providers: [MedicationReconciliationService],
  exports: [MedicationReconciliationService],
})
export class MedicationReconciliationModule {}
