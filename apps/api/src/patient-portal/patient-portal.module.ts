import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ReminderModule } from '../reminders/reminder.module';
import { EmailDeliverabilityService } from '../common/email-policy';
import { PatientPortalController } from './patient-portal.controller';
import { PatientApiController } from './patient-api.controller';
import { ClinicAppointmentRequestsController } from './clinic-appointment-requests.controller';
import { PatientClaimController } from './patient-claim.controller';
import { PatientPortalService } from './patient-portal.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), AuditModule, ReminderModule],
  controllers: [
    PatientPortalController,
    PatientApiController,
    ClinicAppointmentRequestsController,
    PatientClaimController,
  ],
  providers: [EmailDeliverabilityService, PatientPortalService],
  exports: [PatientPortalService],
})
export class PatientPortalModule {}
