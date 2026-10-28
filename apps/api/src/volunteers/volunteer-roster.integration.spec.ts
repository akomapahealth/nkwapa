import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { TENANT_CLINICS, tenantFixtureSql, tenantUser, type TenantFixtureUser } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { VolunteerService } from './volunteer.service';
import { ScreeningEventService } from './screening-event.service';

/**
 * The volunteer directory and roster (#226) against PostgreSQL, through the real RLS
 * interceptor, as the unprivileged application role: another clinic's ids read as missing on
 * every route group, RLS hides them even from a direct query, and the ledger's recipient check
 * accepts a roster email while still refusing a row addressed to nobody.
 *
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeRoster = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1, b1 } = TENANT_CLINICS;
const MANAGER_A1 = tenantUser('a1', 'MANAGER');
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const MANAGER_B1 = tenantUser('b1', 'MANAGER');

const ID = {
  contactB1: '7a000000-0000-4000-8000-000000000001',
  eventB1: '7b000000-0000-4000-8000-000000000001',
  assignmentB1: '7c000000-0000-4000-8000-000000000001',
};

function fixtureSql(): string {
  return `
    UPDATE "User" SET "email" = 'doctor.a1@clinic.org' WHERE "id" = '${DOCTOR_A1.id}';
    INSERT INTO "VolunteerContact" ("id", "clinicId", "displayName", "email", "createdByUserId", "updatedAt")
      VALUES ('${ID.contactB1}', '${b1.id}', 'Efua B', 'efua@clinic.org', '${MANAGER_B1.id}', CURRENT_TIMESTAMP);
    INSERT INTO "ScreeningEvent" ("id", "clinicId", "title", "startsAt", "endsAt", "siteName", "createdByUserId", "updatedAt")
      VALUES ('${ID.eventB1}', '${b1.id}', 'B day', now() + interval '7 days', now() + interval '7 days 4 hours', 'Hall B', '${MANAGER_B1.id}', CURRENT_TIMESTAMP);
    INSERT INTO "ScreeningEventAssignment" ("id", "clinicId", "eventId", "volunteerContactId", "assignedByUserId", "updatedAt")
      VALUES ('${ID.assignmentB1}', '${b1.id}', '${ID.eventB1}', '${ID.contactB1}', '${MANAGER_B1.id}', CURRENT_TIMESTAMP);
  `;
}

class RosterRoute {
  handle() {}
}

describeRoster('volunteer directory and roster (#226)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_volunteer_roster_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  let owner: Client;
  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let volunteers: VolunteerService;
  let events: ScreeningEventService;
  const queue = { add: jest.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');
    if (!appUrl) throw new Error('APP_DATABASE_URL is required');
    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`CREATE DATABASE "${database}"`);
    await root.end();

    owner = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await owner.connect();
    const migrationsRoot = resolve(__dirname, '../../../../packages/db/prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations) {
      await owner.query(
        await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
      );
    }
    await owner.query(tenantFixtureSql());
    await owner.query(fixtureSql());

    process.env.APP_DATABASE_URL = databaseUrl(appUrl, database);
    prisma = new PrismaService();
    await prisma.onModuleInit();
    interceptor = new PrismaRlsInterceptor(prisma, new Reflector());
    const audit = new AuditService(prisma);
    const reminders = new ReminderService(
      prisma,
      audit,
      { send: jest.fn() } as never,
      null,
      queue as never,
      { assertReady: async () => {} } as never,
    );
    volunteers = new VolunteerService(prisma, audit, {
      assertDomainAcceptsEmail: async () => {},
    } as never);
    events = new ScreeningEventService(prisma, audit, reminders, {
      getStatus: () => ({ available: true }),
    } as never);
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy().catch(() => {});
    await owner?.end().catch(() => {});
    process.env.APP_DATABASE_URL = originalAppUrl;
    if (!sourceUrl) return;
    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end();
  });

  /** One request by `user`, through the real RLS interceptor. */
  function as<T>(user: TenantFixtureUser, work: () => Promise<T>): Promise<T> {
    const request = { headers: {}, user: { user: { id: user.id }, roles: user.roles } };
    const context = {
      getType: () => 'http',
      getHandler: () => RosterRoute.prototype.handle,
      getClass: () => RosterRoute,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => from(work()) };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<T>;
  }

  const m = MANAGER_A1.id;

  it("answers 404 for clinic B's ids on every route group under clinic A's path", async () => {
    const attempts: Array<() => Promise<unknown>> = [
      () => volunteers.update(a1.id, ID.contactB1, m, { displayName: 'X' }),
      () => volunteers.setActive(a1.id, ID.contactB1, m, false),
      () => volunteers.setActive(a1.id, ID.contactB1, m, true),
      () => volunteers.link(a1.id, ID.contactB1, m, DOCTOR_A1.id),
      () => volunteers.unlink(a1.id, ID.contactB1, m),
      () => events.get(a1.id, ID.eventB1),
      () => events.update(a1.id, ID.eventB1, m, { title: 'X' }),
      () => events.cancel(a1.id, ID.eventB1, m, { reason: 'x' }),
      () => events.notify(a1.id, ID.eventB1, m),
      () => events.addToRoster(a1.id, ID.eventB1, m, [ID.contactB1]),
      () => events.removeFromRoster(a1.id, ID.eventB1, ID.assignmentB1, m, false),
      () => events.resend(a1.id, ID.eventB1, ID.assignmentB1, m),
    ];
    for (const attempt of attempts) {
      await expect(as(MANAGER_A1, attempt)).rejects.toMatchObject({ status: 404 });
    }

    // A's own event, B's contact and B's assignment: still missing, not borrowed.
    const own = await as(MANAGER_A1, () =>
      events.create(a1.id, m, {
        title: 'A day',
        siteName: 'Hall A',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 90_000_000).toISOString(),
      }),
    );
    await expect(
      as(MANAGER_A1, () => events.addToRoster(a1.id, own.id, m, [ID.contactB1])),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      as(MANAGER_A1, () => events.resend(a1.id, own.id, ID.assignmentB1, m)),
    ).rejects.toMatchObject({ status: 404 });

    const { rows } = await owner.query(
      `SELECT "displayName", "isActive" FROM "VolunteerContact" WHERE "id" = $1`,
      [ID.contactB1],
    );
    expect(rows).toEqual([{ displayName: 'Efua B', isActive: true }]);
  });

  it("hides clinic B's rows from a direct query under clinic A's context", async () => {
    const seen = await as(MANAGER_A1, async () => ({
      contacts: await prisma.volunteerContact.count({ where: { clinicId: b1.id } }),
      events: await prisma.screeningEvent.count({ where: { clinicId: b1.id } }),
      assignments: await prisma.screeningEventAssignment.count({ where: { clinicId: b1.id } }),
    }));
    expect(seen).toEqual({ contacts: 0, events: 0, assignments: 0 });

    await expect(
      as(MANAGER_A1, () =>
        prisma.volunteerContact.create({
          data: {
            clinicId: b1.id,
            displayName: 'Planted',
            email: 'p@clinic.org',
            createdByUserId: m,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows the same email at another clinic, and 409 within one', async () => {
    const created = await as(MANAGER_A1, () =>
      volunteers.create(a1.id, m, { displayName: 'Efua A', email: 'efua@clinic.org' }),
    );
    expect(created.email).toBe('efua@clinic.org');
    await expect(
      as(MANAGER_A1, () =>
        volunteers.create(a1.id, m, { displayName: 'Dup', email: 'efua@clinic.org' }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('links only a same-clinic account with the same email', async () => {
    const contact = await as(MANAGER_A1, () =>
      volunteers.create(a1.id, m, { displayName: 'Doc', email: 'doctor.a1@clinic.org' }),
    );
    await expect(
      as(MANAGER_A1, () => volunteers.link(a1.id, contact.id, m, MANAGER_B1.id)),
    ).rejects.toMatchObject({ status: 400 });
    const linked = await as(MANAGER_A1, () => volunteers.link(a1.id, contact.id, m, DOCTOR_A1.id));
    expect(linked.linkedUserId).toBe(DOCTOR_A1.id);
  });

  it('records a roster email in the ledger keyed on the assignment', async () => {
    const contact = await as(MANAGER_A1, () =>
      volunteers.create(a1.id, m, { displayName: 'Kwame Asante', email: 'kwame@clinic.org' }),
    );
    const event = await as(MANAGER_A1, () =>
      events.create(a1.id, m, {
        title: 'Roster day',
        siteName: 'Hall A',
        startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(),
      }),
    );
    const { roster } = await as(MANAGER_A1, () =>
      events.addToRoster(a1.id, event.id, m, [contact.id]),
    );
    expect(await as(MANAGER_A1, () => events.notify(a1.id, event.id, m))).toEqual({ queued: 1 });

    const { rows } = await owner.query(
      `SELECT "recipientType", "recipientUserId", "screeningEventAssignmentId", "toAddress", "templateKey", "status"
         FROM "Reminder" WHERE "screeningEventAssignmentId" = $1`,
      [roster[0].id],
    );
    expect(rows).toEqual([
      {
        recipientType: 'USER',
        recipientUserId: null,
        screeningEventAssignmentId: roster[0].id,
        toAddress: 'kwame@clinic.org',
        templateKey: 'VOLUNTEER_ROSTER_ASSIGNED_V1',
        status: 'QUEUED',
      },
    ]);
    expect(queue.add).toHaveBeenCalled();
  });

  it('refuses a USER ledger row with no recipient at all', async () => {
    await expect(
      owner.query(
        `INSERT INTO "Reminder" ("id", "clinicId", "recipientType", "channel", "toAddress", "templateKey", "payloadJson", "scheduledAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'USER', 'EMAIL', 'x@clinic.org', 'VOLUNTEER_ROSTER_ASSIGNED_V1', '{}', now(), now())`,
        [a1.id],
      ),
    ).rejects.toMatchObject({ constraint: 'Reminder_recipient_identity_check' });
  });
});
