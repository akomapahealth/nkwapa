import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { NotificationModule } from './notifications/notification.module';
import { PatientModule } from './patients/patient.module';
import { EncounterModule } from './encounters/encounter.module';
import { ClinicModule } from './clinics/clinic.module';
import { SyncModule } from './sync/sync.module';
import { ConsentModule } from './consents/consent.module';
import { UserModule } from './users/user.module';
import { ReminderModule } from './reminders/reminder.module';
import { AdminModule } from './admin/admin.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DrugModule } from './drugs/drug.module';
import { PrescriptionModule } from './prescriptions/prescription.module';
import { ResearchModule } from './research/research.module';
import { PatientPortalModule } from './patient-portal/patient-portal.module';
import { OpsModule } from './ops/ops.module';
import { ChatModule } from './chat/chat.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { SecurityHeadersMiddleware } from './common/security-headers.middleware';
import { RateLimitGuard } from './common/rate-limit.guard';
import { MedicalHistoryModule } from './medical-history/medical-history.module';
import { PatientChartModule } from './patient-chart/patient-chart.module';
import { MedicationReconciliationModule } from './medication-reconciliation/medication-reconciliation.module';
import { DiabetesScreeningModule } from './diabetes-screening/diabetes-screening.module';
import { ClinicalNoteModule } from './clinical-notes/clinical-note.module';

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
    NotificationModule,
    UserModule,
    PatientModule,
    EncounterModule,
    ClinicModule,
    SyncModule,
    ConsentModule,
    ReminderModule,
    AdminModule,
    DashboardModule,
    DrugModule,
    PrescriptionModule,
    ResearchModule,
    PatientPortalModule,
    OpsModule,
    ChatModule,
    MedicalHistoryModule,
    PatientChartModule,
    MedicationReconciliationModule,
    DiabetesScreeningModule,
    ClinicalNoteModule,
  ],
  providers: [RateLimitGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SecurityHeadersMiddleware, CorrelationIdMiddleware, RequestLoggerMiddleware)
      .forRoutes('*');
  }
}
