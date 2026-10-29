import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ReminderModule } from '../reminders/reminder.module';
import { EmailDeliverabilityService } from '../common/email-policy';
import { VolunteerController } from './volunteer.controller';
import { ScreeningEventController } from './screening-event.controller';
import { VolunteerService } from './volunteer.service';
import { ScreeningEventService } from './screening-event.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), AuditModule, ReminderModule],
  controllers: [VolunteerController, ScreeningEventController],
  providers: [EmailDeliverabilityService, VolunteerService, ScreeningEventService],
})
export class VolunteersModule {}
