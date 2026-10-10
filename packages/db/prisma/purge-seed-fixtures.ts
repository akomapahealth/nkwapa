#!/usr/bin/env ts-node
/**
 * Report, and optionally remove, seed fixtures that reached a deployed database (#200).
 *
 * Usage:
 *   DATABASE_URL=<target> npm run db:purge-seed-fixtures
 *       dry run: reports what it finds, changes nothing
 *   DATABASE_URL=<target> SEED_CONFIRM=<db name> npm run db:purge-seed-fixtures -- --apply
 *       in one transaction: deletes the fixture patients, strips every role from the fixture
 *       users and deactivates them
 *
 * What counts as a fixture comes from `src/seed-plan.ts`, the module the seed itself uses:
 *   - users whose email ends in @nkwapa.local, or whose display name starts with "E2E "
 *   - patients whose (first, last) name is one the seed gives a fixture chart
 *
 * Users are deactivated rather than deleted, because audit rows and authored records reference
 * them. Patients are deleted; every table that references a chart cascades except ClinicalNote,
 * which is immutable, so a fixture chart with a note is reported and left alone.
 *
 * Clinics, organizations, the drug catalogue and global system admins are reported only. The
 * seed may have renamed or added a clinic, or created a system admin from a local sub, and which
 * of those is wrong is a judgement for a person, not for a name match.
 *
 * TENANT SAFETY: privileged system maintenance across every clinic, so it connects with the
 * system admin flag set the same way the seed does. Run it only with an approved administrative
 * database credential. It never reads .env: the target is whatever the shell names.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SEED_FIXTURE_EMAIL_DOMAIN, SEED_FIXTURE_PATIENT_NAMES } from '../src/seed-plan';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail('DATABASE_URL is not set.');

  let host: string;
  let database: string;
  try {
    const url = new URL(databaseUrl);
    host = url.hostname;
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    fail('DATABASE_URL is not a valid URL.');
  }
  if (apply && process.env.SEED_CONFIRM !== database) {
    fail(`Set SEED_CONFIRM=${database} to apply changes to "${database}" on ${host}.`);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      options: '-c app.is_system_admin=true',
    }),
  });

  try {
    console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${host} / ${database}\n`);

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { endsWith: SEED_FIXTURE_EMAIL_DOMAIN, mode: 'insensitive' } },
          { displayName: { startsWith: 'E2E ', mode: 'insensitive' } },
        ],
      },
      include: { clinicRoles: true },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Fixture users: ${users.length}`);
    for (const user of users) {
      const roles =
        user.clinicRoles
          .map((role) => `${role.role}${role.clinicId ? '' : ' (global)'}`)
          .join(', ') || 'no roles';
      console.log(
        `  ${user.displayName} <${user.email ?? 'no email'}> ${user.isActive ? 'active' : 'inactive'}; ${roles}; created ${user.createdAt.toISOString()}`,
      );
    }

    const patients = await prisma.patient.findMany({
      where: {
        OR: SEED_FIXTURE_PATIENT_NAMES.map(([firstName, lastName]) => ({ firstName, lastName })),
      },
      include: {
        _count: {
          select: {
            encounters: true,
            appointments: true,
            appointmentRequests: true,
            portalInvites: true,
            clinicalNotes: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const deletable = patients.filter((patient) => patient._count.clinicalNotes === 0);
    console.log(`\nFixture patients: ${patients.length}`);
    for (const patient of patients) {
      const counts = Object.entries(patient._count)
        .map(([name, count]) => `${name} ${count}`)
        .join(', ');
      const kept = patient._count.clinicalNotes > 0 ? '  KEPT: has clinical notes' : '';
      console.log(
        `  ${patient.patientCode} ${patient.firstName} ${patient.lastName}; ${counts}; created ${patient.createdAt.toISOString()}${kept}`,
      );
    }

    console.log('\nFor review, not changed by this script:');
    const admins = await prisma.userClinicRole.findMany({
      where: { clinicId: null, role: UserRole.SYSTEM_ADMIN },
      include: { user: true },
    });
    console.log('  Global system admins (a local SEED_SYSTEM_ADMIN_SUB would show up here):');
    for (const { user } of admins) {
      console.log(
        `    ${user.displayName} sub=${user.keycloakSub} created ${user.createdAt.toISOString()}`,
      );
    }
    const clinics = await prisma.clinic.findMany({
      include: { organization: true, _count: { select: { drugs: true } } },
      orderBy: { createdAt: 'asc' },
    });
    console.log('  Clinics (a local SEED_CLINIC_NAME renames one or adds a second):');
    for (const clinic of clinics) {
      const demo = /demo/i.test(clinic.name) ? '  <- demo name' : '';
      console.log(
        `    ${clinic.name} [${clinic.locationCode}] org=${clinic.organization.slug} drugs=${clinic._count.drugs} created ${clinic.createdAt.toISOString()}${demo}`,
      );
    }

    if (!apply) {
      console.log('\nNothing changed. Re-run with SEED_CONFIRM=<db name> and -- --apply.');
      return;
    }

    const userIds = users.map((user) => user.id);
    const result = await prisma.$transaction(async (tx) => {
      const deletedPatients = await tx.patient.deleteMany({
        where: { id: { in: deletable.map((patient) => patient.id) } },
      });
      const deletedRoles = await tx.userClinicRole.deleteMany({
        where: { userId: { in: userIds } },
      });
      const deactivated = await tx.user.updateMany({
        where: { id: { in: userIds } },
        data: { isActive: false },
      });
      return { deletedPatients, deletedRoles, deactivated };
    });

    console.log(
      `\nDeleted ${result.deletedPatients.count} patients, removed ${result.deletedRoles.count} roles, deactivated ${result.deactivated.count} users.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
