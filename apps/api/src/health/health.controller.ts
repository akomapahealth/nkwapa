import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailStatusService } from '../notifications/email/email-status.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailStatus: EmailStatusService,
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

    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        connectTimeout: 2000,
        lazyConnect: true,
      });
      await redis.ping();
      await redis.quit();
      checks.redis = 'connected';
    } catch {
      checks.redis = 'disconnected';
    }

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
