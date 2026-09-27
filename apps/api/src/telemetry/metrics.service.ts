import { Injectable } from '@nestjs/common';
import {
  TELEMETRY_EVENTS,
  TELEMETRY_FUNNELS,
  type TelemetryCategory,
  type TelemetryEventName,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_METRICS_WINDOW_DAYS } from './dto/metrics-query.dto';

export interface MetricsEventTotal {
  event: TelemetryEventName;
  category: TelemetryCategory;
  description: string;
  succeeded: number;
  failed: number;
  /** Events recorded without an outcome, such as a refused sync change or a throttled request. */
  other: number;
  total: number;
}

export interface MetricsSummary {
  clinicId: string;
  range: { from: string; to: string; days: number };
  events: MetricsEventTotal[];
  funnels: Array<{
    id: string;
    label: string;
    description: string;
    steps: Array<{ event: TelemetryEventName; label: string; count: number }>;
    /** Last step over first, or null when nothing entered the funnel. */
    conversion: number | null;
  }>;
  failureReasons: Array<{ event: TelemetryEventName; reason: string; count: number }>;
  daily: Array<{ date: string; succeeded: number; failed: number }>;
  sync: { pushes: number; mutations: number; applied: number; conflicts: number; errors: number };
}

const SERVER_EVENTS = (Object.keys(TELEMETRY_EVENTS) as TelemetryEventName[]).filter(
  (name) => !('client' in TELEMETRY_EVENTS[name]),
);

/**
 * Aggregates for the metrics dashboard.
 *
 * Only ever counts: the table holds nothing a count could expose, and this service returns no
 * row-level data at all. Scoped to one clinic, and row level security enforces the same scope a
 * second time.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    clinicId: string,
    days = DEFAULT_METRICS_WINDOW_DAYS,
    now = new Date(),
  ): Promise<MetricsSummary> {
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const where = { clinicId, occurredAt: { gte: from, lte: now } };

    const [byOutcome, byReason, daily, sync] = await Promise.all([
      this.prisma.telemetryEvent.groupBy({
        by: ['event', 'outcome'],
        where,
        _count: { _all: true },
      }),
      this.prisma.telemetryEvent.groupBy({
        by: ['event', 'reason'],
        where: { ...where, reason: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { event: 'desc' } },
        take: 25,
      }),
      this.prisma.$queryRaw<Array<{ day: Date; succeeded: bigint; failed: bigint }>>`
        SELECT date_trunc('day', "occurredAt") AS day,
               count(*) FILTER (WHERE "outcome" = 'SUCCEEDED') AS succeeded,
               count(*) FILTER (WHERE "outcome" = 'FAILED') AS failed
        FROM "TelemetryEvent"
        WHERE "clinicId" = ${clinicId}::uuid AND "occurredAt" >= ${from} AND "occurredAt" <= ${now}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<
        Array<{
          pushes: bigint;
          mutations: bigint;
          applied: bigint;
          conflicts: bigint;
          errors: bigint;
        }>
      >`
        SELECT count(*) AS pushes,
               coalesce(sum(("properties"->>'mutations')::int), 0) AS mutations,
               coalesce(sum(("properties"->>'applied')::int), 0) AS applied,
               coalesce(sum(("properties"->>'conflicts')::int), 0) AS conflicts,
               coalesce(sum(("properties"->>'errors')::int), 0) AS errors
        FROM "TelemetryEvent"
        WHERE "clinicId" = ${clinicId}::uuid AND "event" = 'sync.push'
          AND "occurredAt" >= ${from} AND "occurredAt" <= ${now}
      `,
    ]);

    const totals = new Map<string, { succeeded: number; failed: number; other: number }>();
    for (const row of byOutcome) {
      const entry = totals.get(row.event) ?? { succeeded: 0, failed: 0, other: 0 };
      const n = row._count._all;
      if (row.outcome === 'SUCCEEDED') entry.succeeded += n;
      else if (row.outcome === 'FAILED') entry.failed += n;
      else entry.other += n;
      totals.set(row.event, entry);
    }

    // Every server event is listed, recorded or not, so a workflow nobody used reads as zero
    // rather than vanishing from the dashboard.
    const events: MetricsEventTotal[] = SERVER_EVENTS.map((event) => {
      const entry = totals.get(event) ?? { succeeded: 0, failed: 0, other: 0 };
      return {
        event,
        category: TELEMETRY_EVENTS[event].category,
        description: TELEMETRY_EVENTS[event].description,
        ...entry,
        total: entry.succeeded + entry.failed + entry.other,
      };
    });
    const succeededOf = (event: TelemetryEventName) => totals.get(event)?.succeeded ?? 0;

    const [syncRow] = sync;
    return {
      clinicId,
      range: { from: from.toISOString(), to: now.toISOString(), days },
      events,
      funnels: TELEMETRY_FUNNELS.map((funnel) => {
        const steps = funnel.steps.map((step) => ({ ...step, count: succeededOf(step.event) }));
        const first = steps[0]?.count ?? 0;
        const last = steps.at(-1)?.count ?? 0;
        return {
          id: funnel.id,
          label: funnel.label,
          description: funnel.description,
          steps,
          conversion: first > 0 ? Math.min(last / first, 1) : null,
        };
      }),
      failureReasons: byReason
        .filter((row): row is typeof row & { reason: string } => row.reason !== null)
        .map((row) => ({
          event: row.event as TelemetryEventName,
          reason: row.reason,
          count: row._count._all,
        })),
      daily: daily.map((row) => ({
        date: row.day.toISOString().slice(0, 10),
        succeeded: Number(row.succeeded),
        failed: Number(row.failed),
      })),
      sync: {
        pushes: Number(syncRow?.pushes ?? 0),
        mutations: Number(syncRow?.mutations ?? 0),
        applied: Number(syncRow?.applied ?? 0),
        conflicts: Number(syncRow?.conflicts ?? 0),
        errors: Number(syncRow?.errors ?? 0),
      },
    };
  }
}
