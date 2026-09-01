export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  /** A stable code, never provider prose: it is persisted to `Reminder.failureReason`. */
  error?: string;
}

export interface EmailProvider {
  send(
    toAddress: string,
    subject: string,
    htmlBody: string,
    textBody?: string,
  ): Promise<EmailSendResult>;
}
