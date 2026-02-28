import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ReminderService } from "./reminder.service";
import { RemindersController } from "./reminder.controller";
import { ReminderProcessor } from "./reminder.processor";
import { FakeSmsProvider } from "./fake-sms.provider";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue({ name: "reminders" }),
  ],
  controllers: [RemindersController],
  providers: [
    ReminderService,
    ReminderProcessor,
    {
      provide: "SmsProvider",
      useClass: FakeSmsProvider,
    },
  ],
  exports: [ReminderService],
})
export class ReminderModule {}
