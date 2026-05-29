import { randomUUID } from 'crypto';
import type { EmailProvider, EmailSendResult } from './email-provider.interface';

export class FakeEmailProvider implements EmailProvider {
  async send(_toAddress: string, subject: string, htmlBody: string): Promise<EmailSendResult> {
    const providerMessageId = `fake-email:${randomUUID()}`;
    console.log(
      `[FakeEmail] subjectLength=${subject.length} bodyLength=${htmlBody.length} providerMessageId=${providerMessageId}`,
    );
    return { success: true, providerMessageId };
  }
}
