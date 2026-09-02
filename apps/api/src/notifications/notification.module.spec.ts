import { Test } from '@nestjs/testing';
import { NotificationModule } from './notification.module';
import { EMAIL_CONFIG, EMAIL_PROVIDER } from './email/email-provider.token';
import { EmailStatusService } from './email/email-status.service';

/**
 * Compiles the real module rather than constructing the classes by hand.
 *
 * The defect this guards: EmailStatusService took its config as a defaulted constructor
 * argument. Nest treats every constructor parameter as an injection site regardless of
 * its default, so it resolved to null and the API failed at boot with a dependency
 * error. Every unit test passed, because they all built the service directly — the
 * failure only appeared when something actually started the application.
 */
describe('NotificationModule', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  async function compileWith(env: NodeJS.ProcessEnv) {
    process.env = { ...originalEnv, ...env };
    const moduleRef = await Test.createTestingModule({ imports: [NotificationModule] }).compile();
    return moduleRef;
  }

  it('resolves every exported provider with the fake provider', async () => {
    const moduleRef = await compileWith({ EMAIL_PROVIDER: 'fake' });

    expect(moduleRef.get(EMAIL_CONFIG)).toMatchObject({ readiness: 'fake' });
    expect(moduleRef.get(EmailStatusService).getHealthCheck()).toBe('fake');
    expect(moduleRef.get(EMAIL_PROVIDER)).toBeDefined();
  });

  it('starts even when SMTP is requested but not configured', async () => {
    // The whole point of the non-throwing factory: one missing mail setting must not
    // stop the API, which serves every other route.
    const moduleRef = await compileWith({
      EMAIL_PROVIDER: 'nodemailer',
      SMTP_HOST: '',
      EMAIL_FROM: '',
    });

    expect(moduleRef.get(EmailStatusService).getHealthCheck()).toBe('not-configured');
    const provider = moduleRef.get(EMAIL_PROVIDER) as {
      send: (...args: string[]) => Promise<{ success: boolean; error?: string }>;
    };
    await expect(provider.send('a@b.org', 's', '<p>h</p>')).resolves.toEqual({
      success: false,
      error: 'EMAIL_NOT_CONFIGURED',
    });
  });

  it('gives the status service and the provider the same configuration', async () => {
    // Resolved once and shared, so the banner can never claim email works while sends
    // are failing, or the reverse.
    const moduleRef = await compileWith({
      EMAIL_PROVIDER: 'nodemailer',
      SMTP_HOST: 'smtp.test',
      EMAIL_FROM: 'info@akomapa.org',
    });

    expect(moduleRef.get(EMAIL_CONFIG)).toMatchObject({ readiness: 'smtp' });
    expect(moduleRef.get(EmailStatusService).getStatus()).toMatchObject({
      available: true,
      readiness: 'smtp',
      fromAddress: 'info@akomapa.org',
    });
  });
});
