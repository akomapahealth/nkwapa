/**
 * ioredis is mocked because the controller opens a real connection.
 *
 * The CI test job runs without a Redis service, and ioredis retries a refused
 * connection rather than failing fast, so an unmocked `ping()` hangs until the test
 * times out. Locally Redis is usually up, so this only ever fails in CI.
 */
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
  })),
}));

import { HealthController } from './health.controller';
import { EmailStatusService } from '../notifications/email/email-status.service';
import { resolveEmailConfig } from '../notifications/email/email-config';

function controllerWith(env: NodeJS.ProcessEnv) {
  const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
  return new HealthController(prisma as never, new EmailStatusService(resolveEmailConfig(env)));
}

describe('HealthController', () => {
  it('reports the email provider alongside the other checks', async () => {
    const result = await controllerWith({} as NodeJS.ProcessEnv).check();
    expect(result.checks.email).toBe('fake');
  });

  it('reports SMTP as configured once the required variables are present', async () => {
    const result = await controllerWith({
      EMAIL_PROVIDER: 'nodemailer',
      SMTP_HOST: 'smtp.test',
      EMAIL_FROM: 'info@akomapa.org',
    } as NodeJS.ProcessEnv).check();

    expect(result.checks.email).toBe('configured');
  });

  it('reports a half-configured SMTP setup rather than hiding it', async () => {
    const result = await controllerWith({
      EMAIL_PROVIDER: 'nodemailer',
    } as NodeJS.ProcessEnv).check();

    expect(result.checks.email).toBe('not-configured');
  });

  it('never lets the email check decide readiness', async () => {
    // This endpoint gates the Playwright web server and the deploy probe. The fake
    // provider is the correct configuration locally and in CI, and an unconfigured one
    // still leaves every other route working, so neither may read as degraded here.
    for (const env of [{}, { EMAIL_PROVIDER: 'nodemailer' }] as NodeJS.ProcessEnv[]) {
      const result = await controllerWith(env).check();
      expect(result.checks.email).not.toBe('connected');
      expect(result.status).toBe('ok');
    }
  });
});
