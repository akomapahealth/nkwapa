import { Logger } from '@nestjs/common';
import type { EmailProvider } from './email-provider.interface';
import { FakeEmailProvider } from './fake-email.provider';
import { UnconfiguredEmailProvider } from './unconfigured-email.provider';
import { describeEmailUnavailability, resolveEmailConfig, type EmailConfig } from './email-config';

/**
 * Build the email provider without ever throwing.
 *
 * This runs inside a Nest DI factory, so anything thrown here takes the whole API down
 * — every route, not just the ones that send mail. A missing SMTP variable is an
 * operational problem for one feature and must not be a crash loop for the process.
 */
export async function createEmailProvider(
  config: EmailConfig = resolveEmailConfig(),
  logger: Logger = new Logger('EmailProviderFactory'),
): Promise<EmailProvider> {
  if (config.readiness === 'fake') {
    return new FakeEmailProvider();
  }

  if (config.readiness === 'unconfigured' || !config.smtp) {
    return new UnconfiguredEmailProvider(
      describeEmailUnavailability(config) ?? 'SMTP configuration is incomplete.',
    );
  }

  try {
    // Imported lazily so a deployment running the fake provider never loads the SMTP
    // stack, and so a broken install degrades instead of preventing startup.
    const { NodemailerEmailProvider } = await import('./nodemailer-email.provider');
    return new NodemailerEmailProvider(config.smtp);
  } catch (error) {
    logger.error(
      JSON.stringify({
        message: 'Failed to load the SMTP email provider',
        error: error instanceof Error ? error.message : 'unknown error',
      }),
    );
    return new UnconfiguredEmailProvider('The SMTP provider could not be loaded.');
  }
}
