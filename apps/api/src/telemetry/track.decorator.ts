import { SetMetadata } from '@nestjs/common';
import type { TelemetryEventName } from '@nkwapa/db';

export const TRACK_TELEMETRY_KEY = 'telemetry:track';

/** The parts of the request a `describe` callback may read. Deliberately narrow. */
export interface TrackRequestView {
  params: Record<string, string | undefined>;
  /** Only `clinicId` is read from the query, for routes such as `/sync/push?clinicId=`. */
  queryClinicId?: string;
  /** The clinic ClinicScopeGuard resolved, for routes that take it from a header or query. */
  clinicId?: string;
}

export interface TrackOptions<TResult = unknown> {
  /** Properties known from the route itself, e.g. which kind of request this endpoint makes. */
  properties?: Record<string, string | number | boolean>;
  /**
   * Properties derived from the handler's result on success. Whatever it returns still passes the
   * catalog's sanitizer, so a careless callback cannot leak a field the catalog does not allow.
   */
  describe?: (result: TResult, request: TrackRequestView) => Record<string, unknown>;
  /** The clinic, when the route has no `:clinicId` param. */
  clinicId?: (result: TResult | undefined, request: TrackRequestView) => string | null | undefined;
}

export interface TrackMetadata extends TrackOptions {
  event: TelemetryEventName;
}

/**
 * Record a telemetry event for every call to this endpoint: its outcome, its duration, and on
 * failure the refusal's machine code. The handler itself is untouched; see TelemetryInterceptor.
 */
export function Track<TResult = unknown>(
  event: TelemetryEventName,
  options: TrackOptions<TResult> = {},
) {
  return SetMetadata(TRACK_TELEMETRY_KEY, { event, ...options } as TrackMetadata);
}
