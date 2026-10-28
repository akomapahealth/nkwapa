import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReminderModule } from '../reminders/reminder.module';
import { PatientModule } from '../patients/patient.module';
import { IdentitySyncModule } from '../identity-sync/identity-sync.module';
import { UserModule } from '../users/user.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ClinicUsersController } from './clinic-users.controller';
import { UsersLifecycleController } from './users-lifecycle.controller';

@Module({
  imports: [PrismaModule, ReminderModule, PatientModule, IdentitySyncModule, UserModule],
  controllers: [AdminController, ClinicUsersController, UsersLifecycleController],
  providers: [AdminService],
})
export class AdminModule {}
