import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MedicationAdherenceController } from './medication-adherence.controller';
import { MedicationAdherenceService } from './medication-adherence.service';

@Module({
  imports: [AuthModule],
  controllers: [MedicationAdherenceController],
  providers: [MedicationAdherenceService],
  exports: [MedicationAdherenceService],
})
export class MedicationAdherenceModule {}
