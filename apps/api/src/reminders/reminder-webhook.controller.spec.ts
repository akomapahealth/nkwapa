import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ReminderWebhookController } from './reminder-webhook.controller';
import { ReminderService } from './reminder.service';

describe('ReminderWebhookController', () => {
  let controller: ReminderWebhookController;
  let mockUpdateDeliveryStatus: jest.Mock;
  const originalEnv = process.env;

  beforeEach(async () => {
    mockUpdateDeliveryStatus = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReminderWebhookController],
      providers: [
        {
          provide: ReminderService,
          useValue: {
            updateDeliveryStatus: mockUpdateDeliveryStatus,
          },
        },
      ],
    }).compile();

    controller = module.get(ReminderWebhookController);
    process.env = { ...originalEnv, TWILIO_AUTH_TOKEN: 'testtoken' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function buildSignedRequest(
    body: Record<string, string>,
    url = 'https://example.com/webhooks/sms/status',
  ) {
    const sortedParams = Object.keys(body)
      .sort()
      .reduce((acc, key) => acc + key + body[key], '');
    const signature = createHmac('sha1', 'testtoken')
      .update(url + sortedParams)
      .digest('base64');

    return {
      headers: { 'x-twilio-signature': signature, host: 'example.com' },
      protocol: 'https',
      get: (name: string) => {
        if (name === 'host') return 'example.com';
        if (name === 'x-twilio-signature') return signature;
        return undefined;
      },
      originalUrl: '/webhooks/sms/status',
    };
  }

  it('updates status to DELIVERED on valid callback', async () => {
    const body = { MessageSid: 'SM123', MessageStatus: 'delivered' };
    const req = buildSignedRequest(body as Record<string, string>);

    const result = await controller.handleTwilioStatus(
      body as unknown as { MessageSid: string; MessageStatus: string },
      req,
    );

    expect(result).toEqual({ received: true });
    expect(mockUpdateDeliveryStatus).toHaveBeenCalledWith('SM123', 'DELIVERED', undefined);
  });

  it('updates status to FAILED on undelivered', async () => {
    const body = { MessageSid: 'SM456', MessageStatus: 'failed', ErrorCode: '30006' };
    const req = buildSignedRequest(body as Record<string, string>);

    await controller.handleTwilioStatus(
      body as unknown as { MessageSid: string; MessageStatus: string; ErrorCode: string },
      req,
    );

    expect(mockUpdateDeliveryStatus).toHaveBeenCalledWith('SM456', 'FAILED', '30006');
  });

  it('rejects invalid signature', async () => {
    const body = { MessageSid: 'SM789', MessageStatus: 'delivered' };
    const req = {
      headers: { 'x-twilio-signature': 'invalidsig', host: 'example.com' },
      protocol: 'https',
      get: (name: string) => {
        if (name === 'host') return 'example.com';
        if (name === 'x-twilio-signature') return 'invalidsig';
        return undefined;
      },
      originalUrl: '/webhooks/sms/status',
    };

    await expect(
      controller.handleTwilioStatus(
        body as unknown as { MessageSid: string; MessageStatus: string },
        req,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a signature for different parameters', async () => {
    const req = buildSignedRequest({ MessageSid: 'SM1', MessageStatus: 'failed' });
    const body = { MessageSid: 'SM1', MessageStatus: 'delivered' };

    await expect(controller.handleTwilioStatus(body, req)).rejects.toThrow(ForbiddenException);
    expect(mockUpdateDeliveryStatus).not.toHaveBeenCalled();
  });

  it('rejects a request without a signature header', async () => {
    const req = {
      headers: { host: 'example.com' },
      protocol: 'https',
      get: (name: string) => (name === 'host' ? 'example.com' : undefined),
      originalUrl: '/webhooks/sms/status',
    };

    await expect(
      controller.handleTwilioStatus({ MessageSid: 'SM1', MessageStatus: 'delivered' }, req),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses every callback in production when the auth token is unset', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.TWILIO_AUTH_TOKEN;
    const body = { MessageSid: 'SM1', MessageStatus: 'delivered' };

    await expect(controller.handleTwilioStatus(body, buildSignedRequest(body))).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockUpdateDeliveryStatus).not.toHaveBeenCalled();
  });

  it('skips the check outside production when the auth token is unset', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    delete process.env.TWILIO_AUTH_TOKEN;
    const body = { MessageSid: 'SM1', MessageStatus: 'delivered' };
    const req = {
      headers: { host: 'example.com' },
      protocol: 'https',
      get: (name: string) => (name === 'host' ? 'example.com' : undefined),
      originalUrl: '/webhooks/sms/status',
    };

    await controller.handleTwilioStatus(body, req);
    expect(mockUpdateDeliveryStatus).toHaveBeenCalledWith('SM1', 'DELIVERED', undefined);
  });

  it("accepts Twilio's published example signature", async () => {
    // Example from Twilio's webhook security docs, so a refactor cannot change the algorithm.
    process.env = { ...originalEnv, TWILIO_AUTH_TOKEN: '12345' };
    const body = {
      CallSid: 'CA1234567890ABCDE',
      Caller: '+12349013030',
      Digits: '1234',
      From: '+12349013030',
      To: '+18005551212',
    };
    const signature = '0/KCTR6DLpKmkAf8muzZqo1nDgQ=';
    const req = {
      headers: { 'x-twilio-signature': signature, host: 'mycompany.com' },
      protocol: 'https',
      get: (name: string) => (name === 'host' ? 'mycompany.com' : undefined),
      originalUrl: '/myapp.php?foo=1&bar=2',
    };

    await expect(
      controller.handleTwilioStatus(
        body as unknown as { MessageSid: string; MessageStatus: string },
        req,
      ),
    ).resolves.toEqual({ received: true });
  });
});
