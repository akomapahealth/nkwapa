import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { CLINIC_DEFAULT_TIMEZONE, clinicDayWindow, todayInTimeZone } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { hasPermissionAtClinic, type ScopedRole } from '../auth/clinic-roles';
import { PERMISSIONS } from '../auth/constants/permissions';
import { SYSTEM_ACTOR_USER_ID } from '../common/system-actor';
import {
  COUNTED_ACTIONS,
  STAFF_ACTIVITY_CATEGORIES,
  emptyCounts,
  recordHref,
  shiftHoursInWindow,
  type StaffActivityCategory,
  type StaffActivityCounts,
} from './staff-activity.categories';
import type { StaffActivityQueryDto } from './dto/staff-activity-query.dto';

/** Long enough for a quarter; past it the per-person table stops being something to read. */
export const STAFF_ACTIVITY_MAX_DAYS = 92;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_RECORDS = 50;
const STAFF_ROLES: UserRole[] = ['DIRECTOR', 'MANAGER', 'DOCTOR', 'VOLUNTEER'];

interface ActivityWindow {
  from: string;
  to: string;
  timezone: string;
  start: Date;
  end: Date;
}

/**
 * Staff workload at one clinic over a date range (#33), from the audit trail and the shift roster.
 *
 * Read under `AUDIT.READ`: it is a summary of the same events a manager can already read one by
 * one. Rows are listed by name, never ranked, and nothing in them identifies a patient; the
 * drilldown links to records, whose own pages decide what the viewer may see.
 */
@Injectable()
export class StaffActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(clinicId: string, query: StaffActivityQueryDto, now: Date = new Date()) {
    const window = await this.window(clinicId, query, now);
    const [roles, counts, shifts] = await Promise.all([
      this.prisma.userClinicRole.findMany({
        where: { clinicId, role: { in: STAFF_ROLES } },
        select: { role: true, user: { select: { id: true, displayName: true, isActive: true } } },
      }),
      this.countsByPerson(clinicId, window),
      this.prisma.staffShift.findMany({
        where: {
          clinicId,
          checkedInAt: { lte: window.end },
          OR: [{ checkedOutAt: null }, { checkedOutAt: { gte: window.start } }],
        },
        select: { userId: true, checkedInAt: true, checkedOutAt: true },
      }),
    ]);

    const people = new Map<
      string,
      { userId: string; displayName: string; active: boolean; roles: Set<string> }
    >();
    for (const entry of roles) {
      const person = people.get(entry.user.id) ?? {
        userId: entry.user.id,
        displayName: entry.user.displayName,
        active: entry.user.isActive,
        roles: new Set<string>(),
      };
      person.roles.add(entry.role);
      people.set(entry.user.id, person);
    }
    // Someone who acted here without a seat (a system administrator) still did the work.
    const unseated = [...counts.keys()].filter((userId) => !people.has(userId));
    if (unseated.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: unseated } },
        select: { id: true, displayName: true, isActive: true },
      });
      for (const user of users) {
        people.set(user.id, {
          userId: user.id,
          displayName: user.displayName,
          active: user.isActive,
          roles: new Set(),
        });
      }
    }

    const staff = [...people.values()]
      .map((person) => {
        const own = shifts.filter((shift) => shift.userId === person.userId);
        const activity = counts.get(person.userId) ?? emptyCounts();
        return {
          userId: person.userId,
          displayName: person.displayName,
          active: person.active,
          roles: [...person.roles].sort(),
          shifts: own.length,
          shiftHours: shiftHoursInWindow(own, { from: window.start, to: window.end }, now),
          counts: activity,
          total: Object.values(activity).reduce((sum, value) => sum + value, 0),
        };
      })
      // By name, on purpose: a table sorted by volume reads as a ranking.
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const totals = emptyCounts();
    for (const row of staff) {
      for (const category of STAFF_ACTIVITY_CATEGORIES) {
        totals[category.key] += row.counts[category.key];
      }
    }

    return {
      from: window.from,
      to: window.to,
      timezone: window.timezone,
      categories: STAFF_ACTIVITY_CATEGORIES.map(({ key, label }) => ({ key, label })),
      staff,
      totals,
    };
  }

  /** One person's activity by day, and the records they touched, newest first. */
  async person(
    clinicId: string,
    userId: string,
    viewerRoles: readonly ScopedRole[],
    query: StaffActivityQueryDto,
    now: Date = new Date(),
  ) {
    const window = await this.window(clinicId, query, now);
    const [user, daily, recent] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          displayName: true,
          isActive: true,
          clinicRoles: { where: { clinicId }, select: { role: true } },
        },
      }),
      this.prisma.$queryRaw<Array<{ day: string; category: string; n: number }>>`
        WITH categories(action, category) AS (VALUES ${this.categoryValues()})
        SELECT to_char((e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${window.timezone}, 'YYYY-MM-DD') AS day,
               c.category,
               COUNT(DISTINCT e."entityId")::int AS n
        FROM "AuditEvent" e
        JOIN categories c ON c.action = e.action
        WHERE e."clinicId" = ${clinicId}::uuid
          AND e."actorUserId" = ${userId}::uuid
          AND e."createdAt" BETWEEN ${window.start} AND ${window.end}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<
        Array<{ action: string; entityType: string; entityId: string; at: Date }>
      >`
        SELECT * FROM (
          SELECT DISTINCT ON (e."entityType", e."entityId")
                 e.action, e."entityType", e."entityId", e."createdAt" AS at
          FROM "AuditEvent" e
          WHERE e."clinicId" = ${clinicId}::uuid
            AND e."actorUserId" = ${userId}::uuid
            AND e."createdAt" BETWEEN ${window.start} AND ${window.end}
            AND e.action IN (${Prisma.join(COUNTED_ACTIONS)})
          ORDER BY e."entityType", e."entityId", e."createdAt" DESC
        ) latest
        ORDER BY at DESC
        LIMIT ${RECENT_RECORDS}`,
    ]);

    const days = new Map<string, StaffActivityCounts>();
    for (const row of daily) {
      const counts = days.get(row.day) ?? emptyCounts();
      counts[row.category as StaffActivityCategory] = row.n;
      days.set(row.day, counts);
    }
    const canOpen: Record<string, boolean> = {
      Encounter: hasPermissionAtClinic(viewerRoles, clinicId, PERMISSIONS.ENCOUNTER_READ),
      PatientStationVisit: hasPermissionAtClinic(
        viewerRoles,
        clinicId,
        PERMISSIONS.OPS_STATION_READ,
      ),
    };

    return {
      from: window.from,
      to: window.to,
      timezone: window.timezone,
      categories: STAFF_ACTIVITY_CATEGORIES.map(({ key, label }) => ({ key, label })),
      person: user
        ? {
            userId: user.id,
            displayName: user.displayName,
            active: user.isActive,
            roles: user.clinicRoles.map((entry) => entry.role).sort(),
          }
        : null,
      days: [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, counts]) => ({ day, counts })),
      records: recent.map((record) => ({
        action: record.action,
        category: STAFF_ACTIVITY_CATEGORIES.find((category) =>
          (category.actions as readonly string[]).includes(record.action),
        )!.key,
        entityType: record.entityType,
        at: record.at.toISOString(),
        // Only a link the viewer could follow; the record's own page still decides what it shows.
        href: canOpen[record.entityType] ? recordHref(record.entityType, record.entityId) : null,
      })),
    };
  }

  private async countsByPerson(clinicId: string, window: ActivityWindow) {
    const rows = await this.prisma.$queryRaw<
      Array<{ userId: string; category: string; n: number }>
    >`
      WITH categories(action, category) AS (VALUES ${this.categoryValues()})
      SELECT e."actorUserId" AS "userId", c.category, COUNT(DISTINCT e."entityId")::int AS n
      FROM "AuditEvent" e
      JOIN categories c ON c.action = e.action
      WHERE e."clinicId" = ${clinicId}::uuid
        AND e."createdAt" BETWEEN ${window.start} AND ${window.end}
        AND e."actorUserId" <> ${SYSTEM_ACTOR_USER_ID}::uuid
      GROUP BY 1, 2`;
    const counts = new Map<string, StaffActivityCounts>();
    for (const row of rows) {
      const own = counts.get(row.userId) ?? emptyCounts();
      own[row.category as StaffActivityCategory] = row.n;
      counts.set(row.userId, own);
    }
    return counts;
  }

  private categoryValues() {
    return Prisma.join(
      STAFF_ACTIVITY_CATEGORIES.flatMap((category) =>
        category.actions.map((action) => Prisma.sql`(${action}, ${category.key})`),
      ),
    );
  }

  /** The clinic-local days asked for, as a UTC window. Defaults to the last seven days. */
  private async window(
    clinicId: string,
    query: StaffActivityQueryDto,
    now: Date,
  ): Promise<ActivityWindow> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    const timezone = clinicDayWindow(null, clinic?.timezone ?? CLINIC_DEFAULT_TIMEZONE).timezone;
    const to = query.to ?? todayInTimeZone(timezone, now);
    const from =
      query.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
    if (!(days >= 1)) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'The start date must be on or before the end date.',
      });
    }
    if (days > STAFF_ACTIVITY_MAX_DAYS) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: `Choose ${STAFF_ACTIVITY_MAX_DAYS} days or fewer.`,
      });
    }
    return {
      from,
      to,
      timezone,
      start: clinicDayWindow(from, timezone).start,
      end: clinicDayWindow(to, timezone).end,
    };
  }
}
