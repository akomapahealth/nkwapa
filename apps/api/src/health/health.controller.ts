import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailStatusService } from '../notifications/email/email-status.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailStatus: EmailStatusService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'connected';
    } catch {
      checks.db = 'disconnected';
    }

    // The shared client, never a new connection per probe (#199): the deploy probe and uptime
    // checks call this constantly, and each fresh connection cost a handshake and commands.
    checks.redis = (await this.redis.ping()) ? 'connected' : 'disconnected';

    // Reported but deliberately not part of the verdict. This endpoint gates the
    // Playwright web server and the deploy probe, and the fake provider is the correct
    // configuration for local and CI runs; letting it read as degraded would make
    // readiness a function of a mail setting.
    checks.email = this.emailStatus.getHealthCheck();

    const allHealthy = Object.entries(checks)
      .filter(([name]) => name !== 'email')
      .every(([, value]) => value === 'connected');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
