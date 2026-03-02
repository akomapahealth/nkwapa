import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { PatientModule } from './patients/patient.module';
import { EncounterModule } from './encounters/encounter.module';
import { ClinicModule } from './clinics/clinic.module';
import { SyncModule } from './sync/sync.module';
import { ConsentModule } from './consents/consent.module';
import { UserModule } from './users/user.module';
import { ReminderModule } from './reminders/reminder.module';
import { AdminModule } from './admin/admin.module';
import { DashboardModule } from './dashboard/dashboard.module';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: REDIS_URL },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    AuditModule,
    UserModule,
    PatientModule,
    EncounterModule,
    ClinicModule,
    SyncModule,
    ConsentModule,
    ReminderModule,
    AdminModule,
    DashboardModule,
  ],
})
export class AppModule {}
