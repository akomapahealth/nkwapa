import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap, type Observable } from 'rxjs';
import { TelemetryService, telemetryReasonFor } from './telemetry.service';
import { TRACK_TELEMETRY_KEY, type TrackMetadata, type TrackRequestView } from './track.decorator';

/**
 * Records the event a `@Track` endpoint declares, around the handler rather than inside it.
 *
 * Instrumenting at the route keeps services free of telemetry calls and their specs free of a
 * dependency they would have to mock, and it means the recorded outcome is what the caller
 * actually got: a refusal thrown anywhere below the controller is a FAILED event with its code.
 */
@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly telemetry: TelemetryService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<TrackMetadata | undefined>(
      TRACK_TELEMETRY_KEY,
      context.getHandler(),
    );
    if (!meta || context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<{
      params?: Record<string, string>;
      query?: Record<string, unknown>;
      clinicId?: string;
    }>();
    const queryClinicId = request.query?.clinicId;
    const view: TrackRequestView = {
      params: { ...(request.params ?? {}) },
      queryClinicId: typeof queryClinicId === 'string' ? queryClinicId : undefined,
      clinicId: typeof request.clinicId === 'string' ? request.clinicId : undefined,
    };
    const started = Date.now();
    const clinicOf = (result: unknown) =>
      (meta.clinicId ? safely(() => meta.clinicId?.(result, view)) : undefined) ??
      view.params.clinicId ??
      view.clinicId ??
      view.queryClinicId;

    return next.handle().pipe(
      tap({
        next: (result) => {
          this.telemetry.record(meta.event, {
            ...meta.properties,
            ...(meta.describe ? (safely(() => meta.describe?.(result, view)) ?? {}) : {}),
            clinicId: clinicOf(result),
            outcome: 'SUCCEEDED',
            durationMs: Date.now() - started,
          });
        },
        error: (error: unknown) => {
          this.telemetry.record(meta.event, {
            ...meta.properties,
            clinicId: clinicOf(undefined),
            outcome: 'FAILED',
            reason: telemetryReasonFor(error),
            durationMs: Date.now() - started,
          });
        },
      }),
    );
  }
}

/** A describe callback that throws must never turn a success into a failure. */
function safely<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
