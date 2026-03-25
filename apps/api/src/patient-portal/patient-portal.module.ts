import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ReminderModule } from '../reminders/reminder.module';
import { PatientPortalController } from './patient-portal.controller';
import { PatientApiController } from './patient-api.controller';
import { ClinicAppointmentRequestsController } from './clinic-appointment-requests.controller';
import { PatientPortalService } from './patient-portal.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), AuditModule, ReminderModule],
  controllers: [
    PatientPortalController,
    PatientApiController,
    ClinicAppointmentRequestsController,
  ],
  providers: [PatientPortalService],
  exports: [PatientPortalService],
})
export class PatientPortalModule {}
