export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  /** A stable code, never provider prose: it is persisted to `Reminder.failureReason`. */
  error?: string;
  /**
   * Whether a later attempt could plausibly succeed.
   *
   * Only set when the provider can positively identify the failure as transient - a relay that
   * never answered, a connection dropped mid-session, a 4xx SMTP reply. Absent means terminal,
   * so an unclassified failure behaves exactly as it did before this existed rather than
   * quietly acquiring a retry nobody reasoned about.
   */
  retryable?: boolean;
}

export interface EmailProvider {
  send(
    toAddress: string,
    subject: string,
    htmlBody: string,
    textBody?: string,
  ): Promise<EmailSendResult>;
}
