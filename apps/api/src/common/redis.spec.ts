import { EventEmitter } from 'events';
import {
  attachRedisErrorLogging,
  installRedisRejectionGuard,
  isRedisConnectionError,
  bullWorkerConnection,
  REDIS_ERROR_LOG_INTERVAL_MS,
  REDIS_MAX_RECONNECT_DELAY_MS,
  redisRetryStrategy,
} from './redis';

function setup() {
  const emitter = new EventEmitter();
  const logger = { warn: jest.fn(), log: jest.fn() };
  let clock = 0;
  attachRedisErrorLogging(emitter, 'test-client', logger, () => clock);
  return {
    emitter,
    logger,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('attachRedisErrorLogging', () => {
  it('keeps an error event from becoming an uncaught exception', () => {
    const { emitter } = setup();
    expect(() => emitter.emit('error', new Error('connect ECONNREFUSED'))).not.toThrow();
  });

  it('logs the first error, then at most one line per interval with the count left out', () => {
    const { emitter, logger, advance } = setup();

    emitter.emit('error', new Error('connect ECONNREFUSED'));
    for (let i = 0; i < 5; i += 1) {
      advance(1_000);
      emitter.emit('error', new Error('connect ECONNREFUSED'));
    }
    expect(logger.warn).toHaveBeenCalledTimes(1);

    advance(REDIS_ERROR_LOG_INTERVAL_MS);
    emitter.emit('error', new Error('connect ECONNREFUSED'));
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(logger.warn.mock.calls[1][0])).toMatchObject({
      client: 'test-client',
      suppressed: 5,
    });
  });

  it('says when the connection comes back, and starts counting afresh', () => {
    const { emitter, logger, advance } = setup();

    emitter.emit('ready');
    expect(logger.log).not.toHaveBeenCalled();

    emitter.emit('error', new Error('connect ECONNREFUSED'));
    advance(1_000);
    emitter.emit('ready');
    expect(logger.log).toHaveBeenCalledTimes(1);

    advance(1_000);
    emitter.emit('error', new Error('connect ECONNREFUSED'));
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

describe('redisRetryStrategy', () => {
  it('never gives up and never waits longer than the cap', () => {
    expect(redisRetryStrategy(1)).toBe(500);
    expect(redisRetryStrategy(1_000_000)).toBe(REDIS_MAX_RECONNECT_DELAY_MS);
  });
});

describe('bullWorkerConnection', () => {
  it('meets BullMQ worker requirements', () => {
    expect(bullWorkerConnection().maxRetriesPerRequest).toBeNull();
  });
});

describe('isRedisConnectionError', () => {
  it('recognises what ioredis rejects with when Redis is unreachable', () => {
    const maxRetries = new Error('Reached the max retries per request limit (which is 20).');
    maxRetries.name = 'MaxRetriesPerRequestError';
    expect(isRedisConnectionError(maxRetries)).toBe(true);
    expect(isRedisConnectionError(new Error('Connection is closed.'))).toBe(true);
    expect(
      isRedisConnectionError(
        new Error("Stream isn't writeable and enableOfflineQueue options is false"),
      ),
    ).toBe(true);
    expect(isRedisConnectionError(new Error('Command timed out'))).toBe(true);
  });

  it('leaves every other failure alone', () => {
    expect(isRedisConnectionError(new TypeError('x is undefined'))).toBe(false);
    expect(isRedisConnectionError(new Error('Connection is closed by the database'))).toBe(false);
    expect(isRedisConnectionError('Connection is closed.')).toBe(false);
  });
});

describe('installRedisRejectionGuard', () => {
  let added: ((reason: unknown) => void) | undefined;
  afterEach(() => {
    if (added) process.removeListener('unhandledRejection', added);
    added = undefined;
  });

  function guard() {
    const before = process.listeners('unhandledRejection');
    const report = jest.fn();
    const logger = { error: jest.fn() };
    installRedisRejectionGuard(report, logger);
    const handler = process
      .listeners('unhandledRejection')
      .find((listener) => !before.includes(listener)) as (reason: unknown) => void;
    added = handler;
    return { handler, report, logger };
  }

  it('logs and reports a Redis rejection instead of ending the process', () => {
    const { handler, report, logger } = guard();
    const error = new Error('Connection is closed.');
    expect(() => handler(error)).not.toThrow();
    expect(report).toHaveBeenCalledWith(error);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('rethrows anything else, so Node still exits on it', () => {
    const { handler, report } = guard();
    const error = new TypeError('x is undefined');
    expect(() => handler(error)).toThrow(error);
    expect(report).not.toHaveBeenCalled();
  });
});
