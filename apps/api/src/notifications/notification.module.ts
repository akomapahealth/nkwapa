import { Global, Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email/email-provider.token';
import { createEmailProvider } from './email/email-provider.factory';
import { EmailStatusService } from './email/email-status.service';

/**
 * Owns email delivery capability: which provider is in use, and whether it works.
 *
 * Global on purpose, and deliberately a leaf. It depends on no Prisma, no audit, and no
 * queue, so any module can send mail without creating an import cycle. Recording a
 * delivery stays with ReminderService, which owns the ledger table and the queue.
 */
@Global()
@Module({
  providers: [
    EmailStatusService,
    {
      provide: EMAIL_PROVIDER,
      useFactory: () => createEmailProvider(),
    },
  ],
  exports: [EMAIL_PROVIDER, EmailStatusService],
})
export class NotificationModule {}
