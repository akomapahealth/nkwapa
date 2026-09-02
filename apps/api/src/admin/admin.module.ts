import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReminderModule } from '../reminders/reminder.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ClinicUsersController } from './clinic-users.controller';
import { UsersLifecycleController } from './users-lifecycle.controller';

@Module({
  imports: [PrismaModule, ReminderModule],
  controllers: [AdminController, ClinicUsersController, UsersLifecycleController],
  providers: [AdminService],
})
export class AdminModule {}
