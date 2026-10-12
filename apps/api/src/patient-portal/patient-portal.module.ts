import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ReminderModule } from '../reminders/reminder.module';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { StaffInviteModule } from '../staff-invites/staff-invite.module';
import { EmailDeliverabilityService } from '../common/email-policy';
import { PatientPortalController } from './patient-portal.controller';
import { PatientApiController } from './patient-api.controller';
import { ClinicAppointmentsController } from './clinic-appointments.controller';
import { ClinicAppointmentRequestsController } from './clinic-appointment-requests.controller';
import { PatientClaimController } from './patient-claim.controller';
import { PatientPortalService } from './patient-portal.service';
import { PortalInviteExpiryService } from './portal-invite-expiry.service';
import { PortalInviteExpirySweep } from './portal-invite-expiry.sweep';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    AuditModule,
    ReminderModule,
    KeycloakModule,
    StaffInviteModule,
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
    PortalInviteExpirySweep,
  ],
  exports: [PatientPortalService, PortalInviteExpiryService],
})
export class PatientPortalModule {}
