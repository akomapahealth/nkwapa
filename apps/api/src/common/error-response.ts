export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  requestId: string | null;
  retryable: boolean;
  fieldErrors?: ApiFieldError[];
  recoveryAction?: string;
  /**
   * Structured context a client can render, when a sentence is not enough.
   *
   * Only ever what the throwing service put there deliberately: the filter copies this key and
   * drops every other extra field on the payload, so an exception cannot leak internals into a
   * response by accident.
   */
  details?: Record<string, unknown>;
}
