import { Logger } from '@nestjs/common';
import type { EmailProvider, EmailSendResult } from './email-provider.interface';

export const EMAIL_NOT_CONFIGURED = 'EMAIL_NOT_CONFIGURED';

/**
 * Stands in when SMTP was asked for but not supplied.
 *
 * The alternative to this class is worse in both directions: throwing at startup takes
 * the entire API down over a mail setting, and silently falling back to the fake
 * provider reports success for mail that no one will ever receive. Failing each send
 * with a stable code keeps the delivery ledger honest and leaves the reason on screen.
 */
export class UnconfiguredEmailProvider implements EmailProvider {
  private readonly logger = new Logger(UnconfiguredEmailProvider.name);

  constructor(reason: string) {
    this.logger.error(`Email delivery is unavailable. ${reason}`);
  }

  async send(): Promise<EmailSendResult> {
    return { success: false, error: EMAIL_NOT_CONFIGURED };
  }
}
