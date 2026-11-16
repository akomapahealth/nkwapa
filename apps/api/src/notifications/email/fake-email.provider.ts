import { randomUUID } from 'crypto';
import type { EmailAttachment, EmailProvider, EmailSendResult } from './email-provider.interface';

/**
 * The local and test provider.
 *
 * It logs sizes rather than content on purpose. Recipient addresses and message
 * bodies are PHI here, and a development log is the easiest place to leak them.
 */
export class FakeEmailProvider implements EmailProvider {
  async send(
    _toAddress: string,
    subject: string,
    htmlBody: string,
    textBody?: string,
    attachments?: EmailAttachment[],
  ): Promise<EmailSendResult> {
    const providerMessageId = `fake-email:${randomUUID()}`;
    console.log(
      `[FakeEmail] subjectLength=${subject.length} bodyLength=${htmlBody.length} textLength=${textBody?.length ?? 0} attachments=${attachments?.length ?? 0} providerMessageId=${providerMessageId}`,
    );
    return { success: true, providerMessageId };
  }
}
