import { Logger } from '@nestjs/common';
import { RequestLoggerMiddleware } from './request-logger.middleware';
import { ApiExceptionFilter } from './http-exception.filter';
import { redactLogValue, redactUrl } from './redaction';

describe('redaction utilities', () => {
  it('removes query strings from logged URLs', () => {
    expect(redactUrl('/patients?patientCode=NKP-1&phone=%2B233241234567')).toBe(
      '/patients?[redacted]',
    );
  });

  it('keeps a first line for errors whose message starts with a newline', () => {
    // The defect this guards: Prisma messages begin with a newline, so taking line [0]
    // unconditionally logged `error: ""` and erased the only clue to what went wrong.
    const prismaShaped = new Error(
      '\nInvalid `prisma.reminder.update()` invocation:\n\nRecord not found',
    );

    expect(redactLogValue(prismaShaped)).toBe('Invalid `prisma.reminder.update()` invocation:');
  });

  it('falls back to the error name and code when there is no message at all', () => {
    // Node throws AggregateError with an empty message when a dual-stack connect fails.
    const empty = Object.assign(new Error(''), { code: 'ETIMEDOUT' });
    empty.name = 'AggregateError';

    expect(redactLogValue(empty)).toBe('AggregateError (ETIMEDOUT)');
    expect(redactLogValue(new Error(''))).toBe('Error');
  });

  it('never returns an empty string for a whitespace-only message', () => {
    expect(redactLogValue(new Error('   \n\t  '))).not.toBe('');
  });

  it('redacts common secret and PII shapes from log values', () => {
    const redacted = redactLogValue(
      'Bearer abc.def.ghi for test@example.com and postgres://user:pass@localhost/db',
    );

    expect(redacted).not.toContain('abc.def.ghi');
    expect(redacted).not.toContain('test@example.com');
    expect(redacted).not.toContain('user:pass');
  });
});

describe('request/error logging redaction', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs request paths without PHI-bearing query strings', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const middleware = new RequestLoggerMiddleware();
    const listeners = new Map<string, () => void>();
    type ResponseStub = { statusCode: number; on: jest.Mock };
    const response: ResponseStub = {
      statusCode: 200,
      on: jest.fn((event: string, callback: () => void): ResponseStub => {
        listeners.set(event, callback);
        return response;
      }),
    };

    middleware.use(
      {
        method: 'GET',
        originalUrl: '/patients?patientCode=NKP-1&phone=%2B233241234567',
        headers: {},
      } as never,
      response as never,
      jest.fn(),
    );
    listeners.get('finish')?.();

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string) as { url: string };
    expect(payload.url).toBe('/patients?[redacted]');
  });

  it('logs server errors without stack traces or raw request URLs', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const filter = new ApiExceptionFilter();

    filter.catch(new Error('boom for test@example.com\nSTACK LINE'), {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/patients?patientCode=NKP-1',
          headers: { 'x-request-id': 'req-1' },
        }),
      }),
    } as never);

    const payload = JSON.parse(errorSpy.mock.calls[0][0] as string) as {
      url: string;
      errorMessage: string;
    };
    expect(payload.url).toBe('/patients?[redacted]');
    expect(payload.errorMessage).not.toContain('test@example.com');
    expect(payload.errorMessage).not.toContain('STACK LINE');
  });
});
