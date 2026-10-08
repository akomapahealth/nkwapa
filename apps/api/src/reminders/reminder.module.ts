import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReminderService } from './reminder.service';
import { PatientRemindersController, RemindersController } from './reminder.controller';
import { ReminderWebhookController } from './reminder-webhook.controller';
import { ReminderProcessor } from './reminder.processor';
import {
  REMINDER_RECONCILIATION_QUEUE,
  ReminderReconciliationProcessor,
} from './reminder-reconciliation.processor';
import { FakeSmsProvider } from './fake-sms.provider';
import { TwilioSmsProvider } from './twilio-sms.provider';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue({ name: 'reminders' }, { name: REMINDER_RECONCILIATION_QUEUE }),
  ],
  controllers: [RemindersController, PatientRemindersController, ReminderWebhookController],
  providers: [
    ReminderService,
    ReminderProcessor,
    ReminderReconciliationProcessor,
    {
      provide: 'SmsProvider',
      useFactory: () => {
        const provider = process.env.SMS_PROVIDER ?? 'fake';
        if (provider === 'twilio') {
          return new TwilioSmsProvider();
        }
        return new FakeSmsProvider();
      },
    },
  ],
  exports: [ReminderService],
})
export class ReminderModule {}
