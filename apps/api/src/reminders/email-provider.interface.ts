export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(toAddress: string, subject: string, htmlBody: string): Promise<EmailSendResult>;
}
