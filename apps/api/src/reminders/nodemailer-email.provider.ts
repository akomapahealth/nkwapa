import { createTransport, type Transporter } from 'nodemailer';
import type { EmailProvider, EmailSendResult } from './email-provider.interface';

export class NodemailerEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM;

    if (!host || !user || !pass || !from) {
      throw new Error(
        'Missing email config: SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM are required',
      );
    }

    this.from = from;
    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  async send(toAddress: string, subject: string, htmlBody: string): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: toAddress,
        subject,
        html: htmlBody,
      });
      return {
        success: true,
        providerMessageId: info.messageId,
      };
    } catch {
      return { success: false, error: 'Email send failed' };
    }
  }
}
