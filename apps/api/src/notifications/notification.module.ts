import { Global, Module } from '@nestjs/common';
import { EMAIL_CONFIG, EMAIL_PROVIDER } from './email/email-provider.token';
import { createEmailProvider } from './email/email-provider.factory';
import { EmailStatusService } from './email/email-status.service';
import { resolveEmailConfig } from './email/email-config';

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
    {
      // Resolved once at startup so the status endpoint and the provider can never
      // disagree about what the configuration is.
      provide: EMAIL_CONFIG,
      useFactory: () => resolveEmailConfig(),
    },
    EmailStatusService,
    {
      provide: EMAIL_PROVIDER,
      inject: [EMAIL_CONFIG, EmailStatusService],
      useFactory: async (
        config: ReturnType<typeof resolveEmailConfig>,
        status: EmailStatusService,
      ) => {
        const provider = await createEmailProvider(config);
        return {
          async send(...args: Parameters<typeof provider.send>) {
            try {
              const result = await provider.send(...args);
              status.recordSend(result.success, result.error);
              return result;
            } catch (error) {
              status.recordSend(false, error instanceof Error ? error.message : String(error));
              throw error;
            }
          },
        };
      },
    },
  ],
  exports: [EMAIL_PROVIDER, EMAIL_CONFIG, EmailStatusService],
})
export class NotificationModule {}
