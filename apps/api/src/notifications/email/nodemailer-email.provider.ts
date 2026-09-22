import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { redactLogValue } from '../../common/redaction';
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
  /** Milliseconds to establish the TCP connection before giving up. */
  connectionTimeout?: number;
  /** Milliseconds to wait for the server greeting once connected. */
  greetingTimeout?: number;
  /** Milliseconds of socket inactivity tolerated mid-session. */
  socketTimeout?: number;
}

/**
 * A sender as nodemailer accepts it: either a bare address, or an address paired with a
 * display name for nodemailer to quote and encode itself.
 */
export type EmailSender = string | { name: string; address: string };

export interface NodemailerProviderConfig {
  transport: SmtpTransportConfig;
  from: EmailSender;
  replyTo?: string;
}

export type TransporterFactory = (config: SmtpTransportConfig) => Transporter;

/**
 * Pull the diagnosable parts out of a nodemailer failure.
 *
 * `code` is the one field that names the failure mode: ETIMEDOUT for a relay that never
 * answered, ECONNREFUSED for one that did, EAUTH for bad credentials, ESOCKET for a TLS
 * mismatch. Without it every failure reads as the same opaque sentence.
 */
function describeSmtpError(error: unknown): {
  error: string;
  code?: string;
  responseCode?: number;
} {
  if (!(error instanceof Error)) {
    return { error: 'unknown error' };
  }

  const { code, responseCode } = error as Error & { code?: unknown; responseCode?: unknown };

  return {
    // Redacted rather than raw: a rejection routinely quotes the envelope back, and the
    // recipient address is PHI. The code below survives redaction and carries the signal.
    error: redactLogValue(error),
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof responseCode === 'number' ? { responseCode } : {}),
  };
}

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
          ...describeSmtpError(error),
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
      // envelope, and the recipient address is PHI in this system. The host, port and
      // error code are not PHI, and they are what separates "the relay is unreachable"
      // from "the credentials are wrong" without reading the message at all.
      this.logger.warn(
        JSON.stringify({
          message: 'SMTP send failed',
          host: this.config.transport.host,
          port: this.config.transport.port,
          ...describeSmtpError(error),
        }),
      );
      return { success: false, error: 'EMAIL_SEND_FAILED' };
    }
  }
}
