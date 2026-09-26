import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ReminderModule } from '../reminders/reminder.module';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { EmailDeliverabilityService } from '../common/email-policy';
import { ClinicStaffInvitesController } from './clinic-staff-invites.controller';
import { StaffInviteAcceptanceController } from './staff-invite-acceptance.controller';
import { StaffInviteService } from './staff-invite.service';
import { StaffInviteExpiryService } from './staff-invite-expiry.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    AuditModule,
    ReminderModule,
    KeycloakModule,
  ],
  controllers: [ClinicStaffInvitesController, StaffInviteAcceptanceController],
  providers: [EmailDeliverabilityService, StaffInviteService, StaffInviteExpiryService],
  exports: [StaffInviteExpiryService],
})
export class StaffInviteModule {}
