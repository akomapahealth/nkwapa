import { Controller, Post, Body, Req, HttpCode, ForbiddenException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
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
  private readonly logger = new Logger(ReminderWebhookController.name);

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
    if (!authToken) {
      if (process.env.NODE_ENV !== 'production') return; // local dev has no Twilio account
      this.logger.error('TWILIO_AUTH_TOKEN is not set; refusing SMS status callbacks');
      throw new ForbiddenException('SMS status callbacks are not configured');
    }

    const signature = req.headers['x-twilio-signature'] ?? req.get?.('x-twilio-signature');
    if (!signature) {
      throw new ForbiddenException('Missing Twilio signature');
    }

    // Must match the URL Twilio was configured with: the API's public URL behind Render's proxy.
    const protocol = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
    const host = req.get?.('host') ?? req.headers['host'] ?? '';
    const url = `${protocol}://${host}${req.originalUrl}`;

    const sortedParams = Object.keys(body)
      .sort()
      .reduce((acc, key) => acc + key + body[key], '');

    const expected = createHmac('sha1', authToken)
      .update(url + sortedParams)
      .digest('base64');

    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
      throw new ForbiddenException('Invalid Twilio signature');
    }
  }
}
