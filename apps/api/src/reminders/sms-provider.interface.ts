export interface SmsSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface SmsProvider {
  send(toAddress: string, body: string): Promise<SmsSendResult>;
}
