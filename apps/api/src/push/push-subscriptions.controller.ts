import { Body, Controller, HttpCode, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { ReqUser } from '../auth/auth.controller';
import { RateLimit } from '../common/rate-limit.decorator';
import { RemovePushSubscriptionDto, SavePushSubscriptionDto } from './push-subscription.dto';
import { PushService } from './push.service';

type PushRequest = { user: ReqUser; headers?: { 'user-agent'?: string } };

/** This browser's Web Push subscription for the signed-in person (#250). */
@Controller('me/push-subscriptions')
@UseGuards(JwtAuthGuard)
export class PushSubscriptionsController {
  constructor(private readonly push: PushService) {}

  @Put()
  @HttpCode(204)
  @RateLimit({ key: 'me_push_subscribe', limit: 20, windowSeconds: 60, scope: 'user-or-ip' })
  async subscribe(@Request() req: PushRequest, @Body() dto: SavePushSubscriptionDto) {
    await this.push.subscribe(req.user.user.id, {
      ...dto,
      userAgent: req.headers?.['user-agent'] ?? null,
    });
  }

  // POST rather than DELETE with a body: the endpoint is too long and too secret for a query string.
  @Post('remove')
  @HttpCode(204)
  @RateLimit({ key: 'me_push_unsubscribe', limit: 20, windowSeconds: 60, scope: 'user-or-ip' })
  async unsubscribe(@Body() dto: RemovePushSubscriptionDto) {
    await this.push.unsubscribe(dto.endpoint);
  }
}
