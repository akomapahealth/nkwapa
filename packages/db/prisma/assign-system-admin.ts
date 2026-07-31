#!/usr/bin/env ts-node
/**
 * Assign SYSTEM_ADMIN role to a user by Keycloak sub.
 * Usage: SEED_SYSTEM_ADMIN_SUB=<keycloak-sub> pnpm db:assign-system-admin
 *
 * TENANT SAFETY: privileged system maintenance. This operation intentionally has no clinic scope
 * because it grants a global role. Run it only with an approved administrative database credential.
 * Do not copy this direct-client pattern into clinic-scoped maintenance scripts.
 *
 * Get your Keycloak sub from: Keycloak Admin → Users → select user → Details tab
 * Or decode your JWT at jwt.io and copy the "sub" claim.
 */
import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const sub = process.env.SEED_SYSTEM_ADMIN_SUB?.trim();
  if (!sub) {
    console.error('Set SEED_SYSTEM_ADMIN_SUB to the Keycloak user sub (UUID).');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { keycloakSub: sub } });
  if (!user) {
    console.error(
      `No user found with keycloakSub=${sub}. The user must log in to Nkwapa at least once to create their record.`,
    );
    process.exit(1);
  }

  const existing = await prisma.userClinicRole.findFirst({
    where: { userId: user.id, clinicId: null, role: UserRole.SYSTEM_ADMIN },
  });
  if (existing) {
    console.log(`User ${user.displayName} already has SYSTEM_ADMIN.`);
    return;
  }

  await prisma.userClinicRole.create({
    data: { userId: user.id, clinicId: null, role: UserRole.SYSTEM_ADMIN },
  });
  console.log(`Assigned SYSTEM_ADMIN to ${user.displayName}. Log out and back in to apply.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
