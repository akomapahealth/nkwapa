import type { SmsProvider, SmsSendResult } from './sms-provider.interface';

export class TwilioSmsProvider implements SmsProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly statusCallbackUrl?: string;

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw new Error(
        'Missing Twilio config: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are required',
      );
    }
    this.accountSid = sid;
    this.authToken = token;
    this.fromNumber = from;
    this.statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;
  }

  async send(toAddress: string, body: string): Promise<SmsSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const params = new URLSearchParams({
      To: toAddress,
      From: this.fromNumber,
      Body: body,
    });
    if (this.statusCallbackUrl) {
      params.set('StatusCallback', this.statusCallbackUrl);
    }

    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        await response.text();
        return { success: false, error: `Twilio API error ${response.status}` };
      }

      const data = (await response.json()) as { sid?: string; status?: string };
      return {
        success: true,
        providerMessageId: data.sid,
      };
    } catch {
      return { success: false, error: 'Twilio request failed' };
    }
  }
}
