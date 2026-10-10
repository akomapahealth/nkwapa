import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiabetesScreeningController } from './diabetes-screening.controller';
import { DiabetesScreeningService } from './diabetes-screening.service';

@Module({
  imports: [AuthModule],
  controllers: [DiabetesScreeningController],
  providers: [DiabetesScreeningService],
  exports: [DiabetesScreeningService],
})
export class DiabetesScreeningModule {}
