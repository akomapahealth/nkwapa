#!/usr/bin/env ts-node
/**
 * List active staff whose name is still missing or whose display name is still an email (#225).
 *
 * Usage:
 *   npm run db:report-unnamed-staff
 *
 * Read-only. Names cannot be guessed, so nothing is backfilled: these people are asked for their
 * name at their next sign-in. The list is for managers to chase the ones who have not signed in
 * since. Patients are left out; their name lives on the Patient record.
 *
 * TENANT SAFETY: privileged system maintenance, across every organization by design. It connects
 * with the system admin flag set, like seed.ts, because User and role rows are protected by RLS.
 * Run it only with an approved administrative database credential.
 */
import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
  options: '-c app.is_system_admin=true',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const staff = await prisma.user.findMany({
    where: {
      isActive: true,
      clinicRoles: { some: { role: { not: UserRole.PATIENT } } },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      clinicRoles: {
        where: { role: { not: UserRole.PATIENT } },
        select: { role: true, clinic: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const unnamed = staff.filter(
    (user) => !user.firstName || !user.lastName || user.displayName === user.email,
  );

  if (unnamed.length === 0) {
    console.log(`✓ All ${staff.length} active staff have a name.`);
    return;
  }

  console.log(`${unnamed.length} of ${staff.length} active staff still show without a name:\n`);
  console.table(
    unnamed.map((user) => ({
      email: user.email ?? '(no email)',
      showsAs: user.displayName,
      roles: user.clinicRoles
        .map((entry) => `${entry.role}${entry.clinic ? ` @ ${entry.clinic.name}` : ''}`)
        .join(', '),
      since: user.createdAt.toISOString().slice(0, 10),
    })),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
