export interface RenderedMessage {
  subject: string;
  html: string;
  /**
   * Plain-text alternative, always sent alongside the HTML. Spam filters score
   * HTML-only mail worse, and some clinic mailboxes render text only.
   */
  text: string;
  /** Only the templates that also go out over SMS define this. */
  smsBody?: string;
}

/**
 * A template renders one message from a payload that was stored as JSON.
 *
 * `parse` is deliberately total: payloads are read back out of `Reminder.payloadJson`
 * rows that may have been written by an older deploy, and a reminder must not become
 * undeliverable because a field was added later. It fills defaults instead of throwing.
 */
export interface EmailTemplate<TPayload> {
  readonly key: string;
  readonly parse: (raw: Record<string, unknown>) => TPayload;
  readonly render: (payload: TPayload) => RenderedMessage;
}
