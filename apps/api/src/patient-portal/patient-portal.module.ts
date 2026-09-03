import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ReminderModule } from '../reminders/reminder.module';
import { EmailDeliverabilityService } from '../common/email-policy';
import { PatientPortalController } from './patient-portal.controller';
import { PatientApiController } from './patient-api.controller';
import { ClinicAppointmentsController } from './clinic-appointments.controller';
import { ClinicAppointmentRequestsController } from './clinic-appointment-requests.controller';
import { PatientClaimController } from './patient-claim.controller';
import { PatientPortalService } from './patient-portal.service';
import { PortalInviteExpiryService } from './portal-invite-expiry.service';
import {
  PORTAL_INVITE_MAINTENANCE_QUEUE,
  PortalInviteMaintenanceProcessor,
} from './portal-invite-maintenance.processor';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    AuditModule,
    ReminderModule,
    BullModule.registerQueue({ name: PORTAL_INVITE_MAINTENANCE_QUEUE }),
  ],
  controllers: [
    PatientPortalController,
    PatientApiController,
    ClinicAppointmentsController,
    ClinicAppointmentRequestsController,
    PatientClaimController,
  ],
  providers: [
    EmailDeliverabilityService,
    PatientPortalService,
    PortalInviteExpiryService,
    PortalInviteMaintenanceProcessor,
  ],
  exports: [PatientPortalService, PortalInviteExpiryService],
})
export class PatientPortalModule {}
