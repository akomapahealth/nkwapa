import { Controller, Post, Body, Req, HttpCode, ForbiddenException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ReminderService } from './reminder.service';
import { RateLimit } from '../common/rate-limit.decorator';

interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: string;
  To?: string;
  From?: string;
  ErrorCode?: string;
}

@Controller('webhooks/sms')
export class ReminderWebhookController {
  constructor(private readonly reminderService: ReminderService) {}

  @Post('status')
  @HttpCode(200)
  @RateLimit({ key: 'twilio_webhook', limit: 120, windowSeconds: 60, scope: 'ip' })
  async handleTwilioStatus(
    @Body() body: TwilioStatusCallback,
    @Req()
    req: {
      headers: Record<string, string>;
      protocol: string;
      get: (name: string) => string | undefined;
      originalUrl: string;
    },
  ) {
    this.validateTwilioSignature(req, body as unknown as Record<string, string>);

    const { MessageSid, MessageStatus } = body;
    if (!MessageSid || !MessageStatus) {
      return { received: true };
    }

    const statusMap: Record<string, 'DELIVERED' | 'FAILED' | undefined> = {
      delivered: 'DELIVERED',
      undelivered: 'FAILED',
      failed: 'FAILED',
    };

    const mappedStatus = statusMap[MessageStatus.toLowerCase()];
    if (mappedStatus) {
      await this.reminderService.updateDeliveryStatus(MessageSid, mappedStatus, body.ErrorCode);
    }

    return { received: true };
  }

  private validateTwilioSignature(
    req: {
      headers: Record<string, string>;
      protocol: string;
      get: (name: string) => string | undefined;
      originalUrl: string;
    },
    body: Record<string, string>,
  ): void {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return; // Skip validation if no auth token (dev mode)

    const signature = req.headers['x-twilio-signature'] ?? req.get?.('x-twilio-signature');
    if (!signature) {
      throw new ForbiddenException('Missing Twilio signature');
    }

    const protocol = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
    const host = req.get?.('host') ?? req.headers['host'] ?? '';
    const url = `${protocol}://${host}${req.originalUrl}`;

    const sortedParams = Object.keys(body)
      .sort()
      .reduce((acc, key) => acc + key + body[key], '');

    const expected = createHmac('sha1', authToken)
      .update(url + sortedParams)
      .digest('base64');

    if (expected !== signature) {
      throw new ForbiddenException('Invalid Twilio signature');
    }
  }
}
