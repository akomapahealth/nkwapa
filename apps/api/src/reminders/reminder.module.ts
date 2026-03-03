import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ReminderService } from "./reminder.service";
import { RemindersController } from "./reminder.controller";
import { ReminderWebhookController } from "./reminder-webhook.controller";
import { ReminderProcessor } from "./reminder.processor";
import { FakeSmsProvider } from "./fake-sms.provider";
import { FakeEmailProvider } from "./fake-email.provider";
import { TwilioSmsProvider } from "./twilio-sms.provider";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue({ name: "reminders" }),
  ],
  controllers: [RemindersController, ReminderWebhookController],
  providers: [
    ReminderService,
    ReminderProcessor,
    {
      provide: "SmsProvider",
      useFactory: () => {
        const provider = process.env.SMS_PROVIDER ?? "fake";
        if (provider === "twilio") {
          return new TwilioSmsProvider();
        }
        return new FakeSmsProvider();
      },
    },
    {
      provide: "EmailProvider",
      useFactory: () => {
        const provider = process.env.EMAIL_PROVIDER ?? "fake";
        if (provider === "nodemailer") {
          // Dynamic import to avoid requiring nodemailer when not used
          const { NodemailerEmailProvider } = require("./nodemailer-email.provider");
          return new NodemailerEmailProvider();
        }
        return new FakeEmailProvider();
      },
    },
  ],
  exports: [ReminderService],
})
export class ReminderModule {}
