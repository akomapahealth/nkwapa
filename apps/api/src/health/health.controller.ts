import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

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

    const allHealthy = Object.values(checks).every((v) => v === 'connected');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
