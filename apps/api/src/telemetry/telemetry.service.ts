import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  isTelemetryReasonCode,
  sanitizeTelemetry,
  type SanitizedTelemetry,
  type TelemetryEventName,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { redactLogValue } from '../common/redaction';

/** Everything a caller may attach to an event. The sanitizer decides what survives. */
export type TelemetryInput = { clinicId?: string | null } & Record<string, unknown>;

interface BufferedEvent extends SanitizedTelemetry {
  clinicId: string | null;
  occurredAt: Date;
}

/** How often buffered events are written. Short enough that the dashboard feels current. */
export const TELEMETRY_FLUSH_INTERVAL_MS = 5_000;
/** One write never carries more than this. */
export const TELEMETRY_FLUSH_BATCH_SIZE = 250;
/**
 * The buffer's ceiling. If the database is unreachable for long enough to fill it, the oldest
 * events are dropped rather than growing memory without bound: telemetry is best effort, and the
 * audit log, not this table, is what must never lose a row.
 */
export const TELEMETRY_BUFFER_LIMIT = 5_000;

export function isTelemetryEnabled(): boolean {
  return process.env.TELEMETRY_ENABLED !== 'false';
}

/**
 * A failure's reason, as a machine code or not at all.
 *
 * The API's own refusals carry a `code` (`APPOINTMENT_INVALID_TRANSITION`). An exception without
 * one is named by its HTTP status. Anything else is an unexpected failure. The message is never
 * used: it is free text and can carry whatever the throwing code put in it.
 */
export function telemetryReasonFor(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const code =
      response && typeof response === 'object' ? (response as { code?: unknown }).code : undefined;
    if (isTelemetryReasonCode(code)) return code;
    const status = HttpStatus[error.getStatus()];
    return typeof status === 'string' ? status : 'HTTP_ERROR';
  }
  return 'APPLICATION_ERROR';
}

/**
 * Records product and operational events without ever standing in a workflow's way.
 *
 * `record` is synchronous and cannot throw: it sanitizes against the shared catalog, writes one
 * structured log line, and buffers the event. A timer writes the buffer in batches under an
 * explicit system context, outside any request, because a batch can span clinics and a throttled
 * request may belong to none. A slow or unavailable database therefore delays metrics and never a
 * clinician.
 */
@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Telemetry');
  private buffer: BufferedEvent[] = [];
  private droppedForCapacity = 0;
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (!isTelemetryEnabled()) return;
    this.timer = setInterval(() => void this.flush(), TELEMETRY_FLUSH_INTERVAL_MS);
    // Never the reason a process stays alive.
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }

  record(name: TelemetryEventName, input: TelemetryInput = {}): void {
    if (!isTelemetryEnabled()) return;
    try {
      const { clinicId, ...rest } = input;
      const sanitized = sanitizeTelemetry(name, rest);
      if (!sanitized) return;
      if (sanitized.dropped.length) {
        // The keys, never the values: a refused value is refused because it may be sensitive.
        this.logger.warn(
          JSON.stringify({
            message: 'Telemetry properties refused',
            event: name,
            keys: sanitized.dropped,
          }),
        );
      }
      const buffered: BufferedEvent = {
        ...sanitized,
        clinicId: typeof clinicId === 'string' && clinicId ? clinicId : null,
        occurredAt: new Date(),
      };
      this.logger.log(
        JSON.stringify({
          type: 'telemetry',
          event: buffered.event,
          clinicId: buffered.clinicId,
          reason: buffered.reason,
          bucket: buffered.bucket,
          ...buffered.properties,
        }),
      );
      this.buffer.push(buffered);
      if (this.buffer.length > TELEMETRY_BUFFER_LIMIT) {
        this.droppedForCapacity += this.buffer.length - TELEMETRY_BUFFER_LIMIT;
        this.buffer.splice(0, this.buffer.length - TELEMETRY_BUFFER_LIMIT);
      }
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          message: 'Telemetry event not recorded',
          event: name,
          error: redactLogValue(error),
        }),
      );
    }
  }

  /**
   * Run a workflow step and record how it ended.
   *
   * Success records `outcome: SUCCEEDED` plus whatever `describe` derives from the result; failure
   * records `outcome: FAILED` with the error's machine code, then rethrows untouched. The step's
   * behaviour is exactly what it was without instrumentation.
   */
  async track<T>(
    name: TelemetryEventName,
    input: TelemetryInput,
    step: () => Promise<T>,
    describe?: (result: T) => Record<string, unknown>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await step();
      let extra: Record<string, unknown> = {};
      try {
        extra = describe ? describe(result) : {};
      } catch {
        extra = {};
      }
      this.record(name, {
        ...input,
        ...extra,
        outcome: 'SUCCEEDED',
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      this.record(name, {
        ...input,
        outcome: 'FAILED',
        reason: telemetryReasonFor(error),
        durationMs: Date.now() - started,
      });
      throw error;
    }
  }

  /** Write what is buffered. Concurrent callers share one flush. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.writeBuffered().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async writeBuffered(): Promise<void> {
    if (this.droppedForCapacity > 0) {
      this.logger.warn(
        JSON.stringify({
          message: 'Telemetry buffer full; oldest events dropped',
          count: this.droppedForCapacity,
        }),
      );
      this.droppedForCapacity = 0;
    }
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, TELEMETRY_FLUSH_BATCH_SIZE);
      try {
        await this.prisma.withSystemContext(
          { systemReason: 'Record product and operational telemetry' },
          (client) =>
            client.telemetryEvent.createMany({
              data: batch.map((item) => ({
                event: item.event,
                category: item.category,
                clinicId: item.clinicId,
                outcome:
                  typeof item.properties.outcome === 'string' ? item.properties.outcome : null,
                reason: item.reason,
                bucket: item.bucket,
                properties: item.properties,
                occurredAt: item.occurredAt,
              })),
            }),
        );
      } catch (error) {
        // Put the batch back for the next tick; the ceiling above bounds how long that can go on.
        this.buffer.unshift(...batch);
        this.logger.warn(
          JSON.stringify({
            message: 'Telemetry flush failed; will retry',
            error: redactLogValue(error),
          }),
        );
        return;
      }
    }
  }
}
