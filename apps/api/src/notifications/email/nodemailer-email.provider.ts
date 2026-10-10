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

/**
 * Node and nodemailer error codes that mean "the relay never got the message", as opposed to
 * "the relay looked at the message and said no". Only the first kind is worth sending again.
 */
const TRANSIENT_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'ESOCKET',
  'EDNS',
  'EPIPE',
]);

/**
 * Whether a failed send is worth another attempt.
 *
 * SMTP already draws this line: a 4xx reply is a transient negative and a 5xx is permanent, so a
 * response code decides on its own. Failing that, the Node-level code says whether we ever got a
 * conversation at all. EAUTH and EENVELOPE are deliberately absent from the transient set - bad
 * credentials and a bad address do not improve on their own, and retrying them just spends the
 * relay's rate budget on a foregone conclusion.
 *
 * Anything unrecognised is treated as terminal. That keeps this strictly additive: a failure we
 * cannot positively call transient behaves exactly as it did before retries existed.
 */
function isRetryableSmtpError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const { code, responseCode } = error as Error & { code?: unknown; responseCode?: unknown };

  if (typeof responseCode === 'number') {
    return responseCode >= 400 && responseCode < 500;
  }

  return typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code);
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
          retryable: isRetryableSmtpError(error),
          ...describeSmtpError(error),
        }),
      );
      return {
        success: false,
        error: 'EMAIL_SEND_FAILED',
        retryable: isRetryableSmtpError(error),
      };
    }
  }
}
