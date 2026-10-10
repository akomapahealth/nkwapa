import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ReminderModule } from '../reminders/reminder.module';
import { EncounterRepository } from './encounter.repository';
import { EncounterService } from './encounter.service';
import { EncountersController } from './encounters.controller';
import { EncountersByIdController } from './encounters-by-id.controller';

@Module({
  imports: [forwardRef(() => AuthModule), AuditModule, ReminderModule],
  providers: [EncounterRepository, EncounterService],
  controllers: [EncountersController, EncountersByIdController],
  exports: [EncounterService, EncounterRepository],
})
export class EncounterModule {}
