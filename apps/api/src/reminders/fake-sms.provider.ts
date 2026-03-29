import { randomUUID } from "crypto";
import type { SmsProvider, SmsSendResult } from "./sms-provider.interface";

export class FakeSmsProvider implements SmsProvider {
  async send(toAddress: string, body: string): Promise<SmsSendResult> {
    const providerMessageId = `fake:${randomUUID()}`;
    console.log(`[FakeSMS] to=${toAddress} body="${body}" providerMessageId=${providerMessageId}`);
    return { success: true, providerMessageId };
  }
}
