import { randomUUID } from 'crypto';
import type { SmsProvider, SmsSendResult } from './sms-provider.interface';

export class FakeSmsProvider implements SmsProvider {
  async send(_toAddress: string, body: string): Promise<SmsSendResult> {
    const providerMessageId = `fake:${randomUUID()}`;
    console.log(`[FakeSMS] bodyLength=${body.length} providerMessageId=${providerMessageId}`);
    return { success: true, providerMessageId };
  }
}
