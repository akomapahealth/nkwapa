export interface SmsSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  /**
   * Whether a later attempt could plausibly succeed. See the note on `EmailSendResult`.
   *
   * No SMS provider classifies this yet, so SMS failures stay terminal. The field is here so
   * the reminder service can read one shape off both channels rather than narrowing the union.
   */
  retryable?: boolean;
}

export interface SmsProvider {
  send(toAddress: string, body: string): Promise<SmsSendResult>;
}
