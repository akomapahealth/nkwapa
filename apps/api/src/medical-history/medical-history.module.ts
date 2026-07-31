import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MedicalHistoryController } from './medical-history.controller';
import { MedicalHistoryService } from './medical-history.service';

@Module({
  imports: [AuthModule],
  controllers: [MedicalHistoryController],
  providers: [MedicalHistoryService],
  exports: [MedicalHistoryService],
})
export class MedicalHistoryModule {}
