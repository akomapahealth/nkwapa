import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { createHmac } from "crypto";
import { ReminderWebhookController } from "./reminder-webhook.controller";
import { ReminderService } from "./reminder.service";

describe("ReminderWebhookController", () => {
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
    process.env = { ...originalEnv, TWILIO_AUTH_TOKEN: "testtoken" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function buildSignedRequest(
    body: Record<string, string>,
    url = "https://example.com/webhooks/sms/status"
  ) {
    const sortedParams = Object.keys(body)
      .sort()
      .reduce((acc, key) => acc + key + body[key], "");
    const signature = createHmac("sha1", "testtoken")
      .update(url + sortedParams)
      .digest("base64");

    return {
      headers: { "x-twilio-signature": signature, host: "example.com" },
      protocol: "https",
      get: (name: string) => {
        if (name === "host") return "example.com";
        if (name === "x-twilio-signature") return signature;
        return undefined;
      },
      originalUrl: "/webhooks/sms/status",
    };
  }

  it("updates status to DELIVERED on valid callback", async () => {
    const body = { MessageSid: "SM123", MessageStatus: "delivered" };
    const req = buildSignedRequest(body as Record<string, string>);

    const result = await controller.handleTwilioStatus(
      body as unknown as { MessageSid: string; MessageStatus: string },
      req
    );

    expect(result).toEqual({ received: true });
    expect(mockUpdateDeliveryStatus).toHaveBeenCalledWith("SM123", "DELIVERED", undefined);
  });

  it("updates status to FAILED on undelivered", async () => {
    const body = { MessageSid: "SM456", MessageStatus: "failed", ErrorCode: "30006" };
    const req = buildSignedRequest(body as Record<string, string>);

    await controller.handleTwilioStatus(
      body as unknown as { MessageSid: string; MessageStatus: string; ErrorCode: string },
      req
    );

    expect(mockUpdateDeliveryStatus).toHaveBeenCalledWith("SM456", "FAILED", "30006");
  });

  it("rejects invalid signature", async () => {
    const body = { MessageSid: "SM789", MessageStatus: "delivered" };
    const req = {
      headers: { "x-twilio-signature": "invalidsig", host: "example.com" },
      protocol: "https",
      get: (name: string) => {
        if (name === "host") return "example.com";
        if (name === "x-twilio-signature") return "invalidsig";
        return undefined;
      },
      originalUrl: "/webhooks/sms/status",
    };

    await expect(
      controller.handleTwilioStatus(
        body as unknown as { MessageSid: string; MessageStatus: string },
        req
      )
    ).rejects.toThrow(ForbiddenException);
  });
});
