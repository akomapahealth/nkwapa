import { randomUUID } from 'crypto';
import type { EmailProvider, EmailSendResult } from './email-provider.interface';

export class FakeEmailProvider implements EmailProvider {
  async send(toAddress: string, subject: string, htmlBody: string): Promise<EmailSendResult> {
    const providerMessageId = `fake-email:${randomUUID()}`;
    console.log(
      `[FakeEmail] to=${toAddress} subject="${subject}" bodyLength=${htmlBody.length} providerMessageId=${providerMessageId}`,
    );
    return { success: true, providerMessageId };
  }
}
