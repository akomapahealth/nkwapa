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
}
