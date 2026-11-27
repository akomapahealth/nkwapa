import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import {
  TENANT_CLINICS,
  TENANT_PATIENTS,
  tenantFixtureSql,
  tenantUser,
  type TenantFixtureUser,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { AuditService } from '../audit/audit.service';
import { DoctorRequestService } from '../ops/doctor-request.service';
import { StationService } from '../ops/station.service';
import { OpsService } from '../ops/ops.service';
import { PatientService } from '../patients/patient.service';
import { PatientRepository } from '../patients/patient.repository';
import { EncounterService } from '../encounters/encounter.service';
import { EncounterRepository } from '../encounters/encounter.repository';
import { PracticeService } from './practice.service';

/**
 * Practice sessions (#410) against PostgreSQL, through the real RLS interceptor, as the
 * application role. A director adds practice patients and checks them in; one is mid-station with
 * a draft visit and draft note (which RLS hides from directors), one has a signed visit; then the
 * director clears. The real patient in the same line is untouched.
 *
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeDb = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1 } = TENANT_CLINICS;
const real = TENANT_PATIENTS.a1Primary;
const DIRECTOR_A1 = tenantUser('a1', 'DIRECTOR');
const MANAGER_A1 = tenantUser('a1', 'MANAGER');
const VOLUNTEER_A1 = tenantUser('a1', 'VOLUNTEER');
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');

const id = (group: number, n: number) => `7fa${group}0000-0000-4000-8000-00000000000${n}`;
const ID = {
  registration: id(1, 1),
  realCheckIn: id(2, 1),
  realDraft: id(3, 1),
  demoDraft: id(3, 2),
  demoSigned: id(3, 3),
  demoDraftNote: id(4, 2),
  demoSignedNote: id(4, 3),
  demoKept: id(3, 4),
  demoKeptNote: id(4, 4),
  demoInReview: id(3, 5),
  demoInReviewNote: id(4, 5),
};

class PracticeRoute {
  handle() {}
}

describeDb('practice patients (#410)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_practice_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  const originalFlag = process.env.FEATURE_STATION_WORKFLOW_ENABLED;
  const originalKey = process.env.NATIONAL_ID_ENCRYPTION_KEY;
  let owner: Client;
  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let practice: PracticeService;
  let patientRepository: PatientRepository;

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');
    if (!appUrl) throw new Error('APP_DATABASE_URL is required');
    process.env.FEATURE_STATION_WORKFLOW_ENABLED = 'true';
    // Every chart stores an encrypted ID (the patient code for "No ID"); deterministic for tests.
    process.env.NATIONAL_ID_ENCRYPTION_KEY ??= 'a'.repeat(64);
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
    await owner.query(`
      INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt") VALUES
        ('${ID.registration}', '${a1.id}', 'INTAKE', 'Registration', -1, CURRENT_TIMESTAMP);
      INSERT INTO "PatientCheckIn" ("id", "clinicId", "patientId", "checkedInAt", "status", "dayNumber", "updatedAt") VALUES
        ('${ID.realCheckIn}', '${a1.id}', '${real.id}', CURRENT_TIMESTAMP, 'WAITING', 99, CURRENT_TIMESTAMP);
      INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "status", "updatedAt") VALUES
        ('${ID.realDraft}', '${a1.id}', '${real.id}', '${VOLUNTEER_A1.id}', 'DRAFT', CURRENT_TIMESTAMP);
    `);

    process.env.APP_DATABASE_URL = databaseUrl(appUrl, database);
    prisma = new PrismaService();
    await prisma.onModuleInit();
    interceptor = new PrismaRlsInterceptor(prisma, new Reflector());
    const audit = new AuditService(prisma);
    const stations = new StationService(
      prisma,
      audit,
      undefined,
      new DoctorRequestService(prisma, audit),
    );
    const encounters = new EncounterService(
      new EncounterRepository(prisma),
      prisma,
      audit,
      undefined as never,
    );
    patientRepository = new PatientRepository(prisma);
    const patients = new PatientService(
      patientRepository,
      prisma,
      audit,
      encounters,
      undefined as never,
      undefined as never,
    );
    practice = new PracticeService(
      prisma,
      audit,
      patients,
      new OpsService(prisma, audit, stations),
      stations,
      encounters,
    );
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy().catch(() => {});
    await owner?.end().catch(() => {});
    process.env.APP_DATABASE_URL = originalAppUrl;
    // Assigning undefined to process.env stores the string "undefined".
    for (const [name, value] of [
      ['FEATURE_STATION_WORKFLOW_ENABLED', originalFlag],
      ['NATIONAL_ID_ENCRYPTION_KEY', originalKey],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (!sourceUrl) return;
    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end();
  });

  function as<T>(user: TenantFixtureUser, work: () => Promise<T>): Promise<T> {
    const request = { headers: {}, user: { user: { id: user.id }, roles: user.roles } };
    const context = {
      getType: () => 'http',
      getHandler: () => PracticeRoute.prototype.handle,
      getClass: () => PracticeRoute,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => from(work()) };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<T>;
  }

  const director = { userId: DIRECTOR_A1.id, requestId: 'practice-spec' };
  let demoIds: string[] = [];

  it('adds demo charts with invented names and no contact details, and queues them', async () => {
    const result = await as(DIRECTOR_A1, () =>
      practice.addPatients(a1.id, director, { count: 3, checkIn: true }),
    );
    expect(result).toEqual({ created: 3, checkedIn: 3, queuedAtStation: 'Registration' });

    const { rows } = await owner.query(
      `SELECT "id", "lastName", "phoneE164", "email", "nationalIdType", "dob", "createdByUserId"
       FROM "Patient" WHERE "isDemo" AND "primaryClinicId" = $1 ORDER BY "patientCode"`,
      [a1.id],
    );
    expect(rows).toHaveLength(3);
    demoIds = rows.map((row) => row.id);
    for (const row of rows) {
      expect(row.lastName).toMatch(/^Demo /);
      expect(row).toMatchObject({ phoneE164: null, email: null, nationalIdType: 'NONE' });
      expect(row.createdByUserId).toBe(DIRECTOR_A1.id);
      const age = (Date.now() - new Date(row.dob).getTime()) / (365.25 * 86_400_000);
      expect(age).toBeGreaterThanOrEqual(24.9);
      expect(age).toBeLessThan(76.1);
    }
    const queued = await owner.query(
      `SELECT count(*)::int AS n FROM "PatientStationVisit" visit
       JOIN "PatientCheckIn" check_in ON check_in."id" = visit."patientCheckInId"
       WHERE visit."stationId" = $1 AND visit."status" = 'QUEUED' AND check_in."patientId" = ANY($2)`,
      [ID.registration, demoIds],
    );
    expect(queued.rows[0].n).toBe(3);

    const audit = await owner.query(
      `SELECT "afterJson" FROM "AuditEvent" WHERE "action" = 'PRACTICE.CREATE'`,
    );
    expect(audit.rows.map((row) => JSON.parse(row.afterJson))).toEqual([
      { created: 3, checkedIn: 3 },
    ]);
  });

  it('refuses a second add within seconds: a double tap', async () => {
    await expect(
      as(DIRECTOR_A1, () => practice.addPatients(a1.id, director, { count: 3 })),
    ).rejects.toMatchObject({ status: 429, response: { code: 'PRACTICE_TOO_SOON' } });
  });

  it('keeps the draft-clearing function from anyone but a director', async () => {
    for (const user of [MANAGER_A1, VOLUNTEER_A1]) {
      await expect(
        as(
          user,
          () => prisma.$queryRaw`SELECT * FROM app.practice_clear_draft_notes(${a1.id}::uuid)`,
        ),
      ).rejects.toThrow(/managed by a director/);
    }
  });

  it('clears open check-ins and drafts, keeps signed work and the real patient', async () => {
    const [mid, signed, submitted] = demoIds;
    // One practice patient is with a volunteer: a draft visit and a draft note. Another has a
    // signed visit, and a visit in review whose note is still a draft. The third has a draft visit
    // whose note was already submitted. Only the first is unfinished work a clear may delete.
    await owner.query(`
      INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "status", "updatedAt") VALUES
        ('${ID.demoDraft}', '${a1.id}', '${mid}', '${VOLUNTEER_A1.id}', 'DRAFT', CURRENT_TIMESTAMP),
        ('${ID.demoSigned}', '${a1.id}', '${signed}', '${VOLUNTEER_A1.id}', 'FINALIZED', CURRENT_TIMESTAMP),
        ('${ID.demoInReview}', '${a1.id}', '${signed}', '${VOLUNTEER_A1.id}', 'IN_REVIEW', CURRENT_TIMESTAMP),
        ('${ID.demoKept}', '${a1.id}', '${submitted}', '${VOLUNTEER_A1.id}', 'DRAFT', CURRENT_TIMESTAMP);
      INSERT INTO "ClinicalNote" ("id", "clinicId", "patientId", "encounterId", "authorUserId", "authorRole", "status", "history", "assessment", "plan", "updatedAt") VALUES
        ('${ID.demoDraftNote}', '${a1.id}', '${mid}', '${ID.demoDraft}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', 'DRAFT', 'h', 'a', 'p', CURRENT_TIMESTAMP),
        ('${ID.demoInReviewNote}', '${a1.id}', '${signed}', '${ID.demoInReview}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', 'DRAFT', 'h', 'a', 'p', CURRENT_TIMESTAMP);
      INSERT INTO "ClinicalNote" ("id", "clinicId", "patientId", "encounterId", "authorUserId", "authorRole", "status", "assignedDoctorId", "submittedByUserId", "submittedAt", "history", "assessment", "plan", "updatedAt") VALUES
        ('${ID.demoSignedNote}', '${a1.id}', '${signed}', '${ID.demoSigned}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', 'PENDING_COSIGN', '${DOCTOR_A1.id}', '${VOLUNTEER_A1.id}', CURRENT_TIMESTAMP, 'h', 'a', 'p', CURRENT_TIMESTAMP),
        ('${ID.demoKeptNote}', '${a1.id}', '${submitted}', '${ID.demoKept}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', 'PENDING_COSIGN', '${DOCTOR_A1.id}', '${VOLUNTEER_A1.id}', CURRENT_TIMESTAMP, 'h', 'a', 'p', CURRENT_TIMESTAMP);
      UPDATE "PatientCheckIn" SET "status" = 'IN_PROGRESS', "encounterId" = '${ID.demoDraft}' WHERE "patientId" = '${mid}';
      UPDATE "PatientStationVisit" SET "status" = 'IN_PROGRESS', "claimedByUserId" = '${VOLUNTEER_A1.id}', "claimedAt" = CURRENT_TIMESTAMP, "encounterId" = '${ID.demoDraft}'
        WHERE "patientCheckInId" = (SELECT "id" FROM "PatientCheckIn" WHERE "patientId" = '${mid}');
    `);

    const before = await as(DIRECTOR_A1, () => practice.summary(a1.id));
    expect(before).toEqual({ charts: 3, openCheckIns: 3, withVolunteer: 1, draftVisits: 1 });

    const result = await as(DIRECTOR_A1, () => practice.clear(a1.id, director));
    expect(result).toEqual({ charts: 3, cancelledCheckIns: 3, deletedDrafts: 1, deletedNotes: 1 });

    const after = await as(DIRECTOR_A1, () => practice.summary(a1.id));
    expect(after).toEqual({ charts: 0, openCheckIns: 0, withVolunteer: 0, draftVisits: 0 });

    const state = await owner.query(
      `SELECT
         (SELECT count(*)::int FROM "PatientStationVisit" visit
            JOIN "PatientCheckIn" ci ON ci."id" = visit."patientCheckInId"
            WHERE ci."patientId" = ANY($1) AND visit."status" IN ('QUEUED', 'IN_PROGRESS')) AS "openVisits",
         (SELECT count(*)::int FROM "PatientCheckIn" WHERE "patientId" = ANY($1) AND "status" = 'CANCELLED') AS "cancelled",
         (SELECT count(*)::int FROM "Encounter" WHERE "id" = '${ID.demoDraft}') AS "demoDraft",
         (SELECT count(*)::int FROM "ClinicalNote" WHERE "id" = '${ID.demoDraftNote}') AS "demoDraftNote",
         (SELECT count(*)::int FROM "Encounter" WHERE "id" = '${ID.demoSigned}') AS "demoSigned",
         (SELECT count(*)::int FROM "ClinicalNote" WHERE "id" = '${ID.demoSignedNote}') AS "demoSignedNote",
         (SELECT count(*)::int FROM "Encounter" WHERE "id" IN ('${ID.demoKept}', '${ID.demoInReview}')) AS "keptVisits",
         (SELECT count(*)::int FROM "ClinicalNote" WHERE "id" IN ('${ID.demoKeptNote}', '${ID.demoInReviewNote}')) AS "keptNotes",
         (SELECT "status"::text FROM "PatientCheckIn" WHERE "id" = '${ID.realCheckIn}') AS "realCheckIn",
         (SELECT count(*)::int FROM "Encounter" WHERE "id" = '${ID.realDraft}') AS "realDraft",
         (SELECT count(*)::int FROM "Patient" WHERE "id" = ANY($1) AND "demoClearedAt" IS NOT NULL) AS "cleared"`,
      [demoIds],
    );
    expect(state.rows[0]).toEqual({
      openVisits: 0,
      cancelled: 3,
      demoDraft: 0,
      demoDraftNote: 0,
      demoSigned: 1,
      demoSignedNote: 1,
      keptVisits: 2,
      keptNotes: 2,
      realCheckIn: 'WAITING',
      realDraft: 1,
      cleared: 3,
    });

    const reasons = await owner.query(
      `SELECT DISTINCT "endReason" FROM "PatientStationVisit" visit
       JOIN "PatientCheckIn" ci ON ci."id" = visit."patientCheckInId" WHERE ci."patientId" = ANY($1)`,
      [demoIds],
    );
    expect(reasons.rows).toEqual([{ endReason: 'PRACTICE_CLEARED' }]);

    // Counts only in the practice audit rows; a tombstone for each deleted draft for sync.
    const audit = await owner.query(
      `SELECT "action", "afterJson" FROM "AuditEvent"
       WHERE "action" IN ('PRACTICE.CLEAR', 'ENCOUNTER.DELETE', 'CLINICAL_NOTE.DELETE') ORDER BY "action"`,
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'CLINICAL_NOTE.DELETE',
      'ENCOUNTER.DELETE',
      'PRACTICE.CLEAR',
    ]);
    expect(JSON.parse(audit.rows[2].afterJson)).toEqual(result);
  });

  it('leaves cleared practice charts out of the patient list and search', async () => {
    const listed = await as(DIRECTOR_A1, () =>
      patientRepository.findIds({ primaryClinicId: a1.id }),
    );
    expect(listed).toContain(real.id);
    expect(listed.filter((patientId) => demoIds.includes(patientId))).toEqual([]);
    const searched = await as(DIRECTOR_A1, () =>
      patientRepository.findMany({ primaryClinicId: a1.id, search: 'Demo' }),
    );
    expect(searched).toEqual([]);
  });

  it('clears again with nothing left to do', async () => {
    const result = await as(DIRECTOR_A1, () => practice.clear(a1.id, director));
    expect(result).toEqual({ charts: 0, cancelledCheckIns: 0, deletedDrafts: 0, deletedNotes: 0 });
  });
});
