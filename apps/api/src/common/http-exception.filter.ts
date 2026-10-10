import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorResponse, type ApiFieldError } from './error-response';
import { getRequestId } from './request-context';
import { redactLogValue, redactUrl } from './redaction';

function toFieldErrors(value: unknown): ApiFieldError[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const fieldErrors = value
    .map((entry) => {
      if (
        entry &&
        typeof entry === 'object' &&
        'field' in entry &&
        'message' in entry &&
        typeof (entry as { field?: unknown }).field === 'string' &&
        typeof (entry as { message?: unknown }).message === 'string'
      ) {
        return {
          field: (entry as { field: string }).field,
          message: (entry as { message: string }).message,
        };
      }

      return null;
    })
    .filter((entry): entry is ApiFieldError => entry != null);

  return fieldErrors.length > 0 ? fieldErrors : undefined;
}

function fallbackCode(status: number) {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED';
  }
}

@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestId(request) ?? null;

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;

    let message =
      status >= 500 ? 'An unexpected error occurred. Please try again.' : 'Request failed.';
    let code = fallbackCode(status);
    let fieldErrors: ApiFieldError[] | undefined;
    let recoveryAction: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exceptionResponse && typeof exceptionResponse === 'object') {
      const payload = exceptionResponse as Record<string, unknown>;
      const responseMessage = payload.message;
      if (Array.isArray(responseMessage)) {
        message = responseMessage.join(', ');
      } else if (typeof responseMessage === 'string' && responseMessage.trim()) {
        message = responseMessage;
      }

      if (typeof payload.code === 'string' && payload.code.trim()) {
        code = payload.code;
      }

      fieldErrors = toFieldErrors(payload.fieldErrors);

      if (typeof payload.recoveryAction === 'string' && payload.recoveryAction.trim()) {
        recoveryAction = payload.recoveryAction;
      }

      // Deliberately the only extra key that survives. Anything else a thrower attached to the
      // payload is dropped, so an exception cannot widen a response body by accident.
      if (
        payload.details &&
        typeof payload.details === 'object' &&
        !Array.isArray(payload.details)
      ) {
        details = payload.details as Record<string, unknown>;
      }
    } else if (exception instanceof Error && status < 500) {
      message = exception.message;
    }

    if (!recoveryAction) {
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        recoveryAction = 'Wait a moment and try again.';
      } else if (status === HttpStatus.UNAUTHORIZED) {
        recoveryAction = 'Sign in again and retry the action.';
      } else if (status === HttpStatus.FORBIDDEN) {
        recoveryAction = 'Verify that you selected the correct clinic and still have access.';
      } else if (status >= 500) {
        recoveryAction =
          'Refresh the page or retry in a moment. Contact support if the issue continues.';
      }
    }

    const errorBody: ApiErrorResponse = {
      code,
      message,
      requestId,
      retryable: status === HttpStatus.TOO_MANY_REQUESTS || status >= 500,
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(recoveryAction ? { recoveryAction } : {}),
      ...(details ? { details } : {}),
    };

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          requestId,
          method: request.method,
          url: redactUrl(request.originalUrl),
          status,
          code,
          errorName: exception instanceof Error ? exception.name : typeof exception,
          errorMessage: redactLogValue(exception),
        }),
      );
    }

    response.status(status).json(errorBody);
  }
}
