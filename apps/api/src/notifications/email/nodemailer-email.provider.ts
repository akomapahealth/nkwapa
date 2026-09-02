import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { EmailProvider, EmailSendResult } from './email-provider.interface';

export interface SmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  /**
   * Omitted entirely for SMTP servers that accept unauthenticated mail. Passing an
   * `auth` object with empty strings is not the same thing: nodemailer would still
   * attempt AUTH and the server would reject the session. Local Mailpit and several
   * internal relays are unauthenticated, so this has to be absent rather than blank.
   */
  auth?: { user: string; pass: string };
}

export interface NodemailerProviderConfig {
  transport: SmtpTransportConfig;
  from: string;
  replyTo?: string;
}

export type TransporterFactory = (config: SmtpTransportConfig) => Transporter;

export class NodemailerEmailProvider implements EmailProvider {
  private readonly logger = new Logger(NodemailerEmailProvider.name);
  private readonly transporter: Transporter;

  constructor(
    private readonly config: NodemailerProviderConfig,
    createTransporter: TransporterFactory = (transport) => createTransport(transport),
  ) {
    this.transporter = createTransporter(config.transport);
  }

  /**
   * Confirm the relay is reachable without blocking startup.
   *
   * A bad SMTP host should surface in the logs and on the status endpoint, not by
   * failing the first reminder hours later, and not by refusing to boot the API.
   */
  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          message: 'SMTP verification failed',
          host: this.config.transport.host,
          port: this.config.transport.port,
          error: error instanceof Error ? error.message : 'unknown error',
        }),
      );
      return false;
    }
  }

  async send(
    toAddress: string,
    subject: string,
    htmlBody: string,
    textBody?: string,
  ): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        to: toAddress,
        subject,
        html: htmlBody,
        ...(textBody ? { text: textBody } : {}),
        ...(this.config.replyTo ? { replyTo: this.config.replyTo } : {}),
      });
      return { success: true, providerMessageId: info.messageId };
    } catch (error) {
      // The message is logged but never returned: SMTP failures routinely quote the
      // envelope, and the recipient address is PHI in this system.
      this.logger.warn(
        JSON.stringify({
          message: 'SMTP send failed',
          host: this.config.transport.host,
          error: error instanceof Error ? error.message : 'unknown error',
        }),
      );
      return { success: false, error: 'EMAIL_SEND_FAILED' };
    }
  }
}
