// packages/db/prisma/seed.ts
/**
 * TENANT SAFETY: privileged system bootstrap.
 *
 * This script intentionally uses a direct Prisma client because it creates the organization,
 * clinic, initial users, roles, and clinic seed data needed before an application tenant context
 * can exist. Run it only with an approved administrative database credential. It is not a pattern
 * for clinic maintenance or data repair scripts.
 */
import 'dotenv/config';
import { PrismaClient, UserRole, Sex, NationalIdType, EncounterStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  encryptNationalId,
  hashNationalId,
  nationalIdLast4,
  hasEncryptionKey,
  generatePatientCode,
} from '../index';
import { seedDrugs } from './seed-drugs';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});
const prisma = new PrismaClient({ adapter });

function toLocationCode(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized || 'clinic';
}

async function ensureGlobalRole(prisma: PrismaClient, userId: string, role: UserRole) {
  const existingRole = await prisma.userClinicRole.findFirst({
    where: { userId, clinicId: null, role },
  });

  if (!existingRole) {
    await prisma.userClinicRole.create({
      data: { userId, clinicId: null, role },
    });
  }
}

async function ensureClinicRole(
  prisma: PrismaClient,
  userId: string,
  clinicId: string,
  role: UserRole,
) {
  await prisma.userClinicRole.upsert({
    where: {
      userId_clinicId_role: { userId, clinicId, role },
    },
    update: {},
    create: { userId, clinicId, role },
  });
}

async function ensureResearchSettings(
  prisma: PrismaClient,
  clinicId: string,
  updatedByUserId: string,
) {
  await prisma.clinicResearchSettings.upsert({
    where: { clinicId },
    update: {
      updatedByUserId,
      researchEnabled: false,
      requiresDirectorApprovalEachExport: true,
    },
    create: {
      clinicId,
      updatedByUserId,
      researchEnabled: false,
      requiresDirectorApprovalEachExport: true,
    },
  });
}

async function main() {
  const organizationName = process.env.SEED_ORGANIZATION_NAME ?? 'Nkwapa Health';
  const organizationSlug = process.env.SEED_ORGANIZATION_SLUG ?? 'default';
  const organizationTimezone = process.env.SEED_ORGANIZATION_TIMEZONE ?? 'Africa/Accra';
  const clinicName = process.env.SEED_CLINIC_NAME ?? 'Nkwapa Clinic - Demo';
  const clinicRegion = process.env.SEED_CLINIC_REGION ?? 'Greater Accra';
  const clinicCountry = process.env.SEED_CLINIC_COUNTRY ?? 'GH';
  const clinicTimezone = process.env.SEED_CLINIC_TIMEZONE ?? organizationTimezone;
  const clinicLocationCode = process.env.SEED_CLINIC_LOCATION_CODE ?? toLocationCode(clinicName);
  const clinicZoneCode = process.env.SEED_CLINIC_ZONE_CODE?.trim() || null;
  let researchSettingsOwnerId: string | null = null;

  const organization = await prisma.organization.upsert({
    where: { slug: organizationSlug },
    update: {
      name: organizationName,
      timezone: organizationTimezone,
    },
    create: {
      name: organizationName,
      slug: organizationSlug,
      timezone: organizationTimezone,
    },
  });

  // Clinic.name is not unique; use findFirst + create/update instead of upsert
  let clinic = await prisma.clinic.findFirst({
    where: {
      organizationId: organization.id,
      locationCode: clinicLocationCode,
    },
  });
  if (clinic) {
    clinic = await prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        organizationId: organization.id,
        name: clinicName,
        region: clinicRegion,
        countryCode: clinicCountry,
        timezone: clinicTimezone,
        locationCode: clinicLocationCode,
        zoneCode: clinicZoneCode,
        isActive: true,
      },
    });
  } else {
    clinic = await prisma.clinic.create({
      data: {
        organizationId: organization.id,
        name: clinicName,
        region: clinicRegion,
        countryCode: clinicCountry,
        timezone: clinicTimezone,
        locationCode: clinicLocationCode,
        zoneCode: clinicZoneCode,
        isActive: true,
      },
    });
  }

  const sysAdminSub = process.env.SEED_SYSTEM_ADMIN_SUB;
  const sysAdminName = process.env.SEED_SYSTEM_ADMIN_NAME ?? 'System Admin';

  if (sysAdminSub) {
    const user = await prisma.user.upsert({
      where: { keycloakSub: sysAdminSub },
      update: { displayName: sysAdminName, isActive: true },
      create: { keycloakSub: sysAdminSub, displayName: sysAdminName, isActive: true },
    });
    researchSettingsOwnerId = user.id;

    // Global SYSTEM_ADMIN role (clinicId = null)
    // Prisma upsert doesn't support null in compound unique; use findFirst + create
    await ensureGlobalRole(prisma, user.id, UserRole.SYSTEM_ADMIN);

    // Also give a DIRECTOR role for demo on the demo clinic (optional convenience)
    await ensureClinicRole(prisma, user.id, clinic.id, UserRole.DIRECTOR);

    // Default research settings for clinic
    await ensureResearchSettings(prisma, clinic.id, user.id);

    // Seed drug catalog for the clinic
    await seedDrugs(prisma, clinic.id);

    console.log('Seeded clinic + system admin user + roles + clinic research settings.');

    // Sample patient + encounters when SEED_SAMPLE_PATIENT=true and encryption key is set
    const seedSamplePatient = process.env.SEED_SAMPLE_PATIENT === 'true';
    if (seedSamplePatient && hasEncryptionKey()) {
      const existingDemo = await prisma.patient.findFirst({
        where: {
          primaryClinicId: clinic.id,
          firstName: 'Demo',
          lastName: 'Patient',
        },
      });
      if (existingDemo) {
        console.log('Sample patient already exists; skipping.');
      } else {
        const nationalIdPlain = 'GH-123456789-0'; // placeholder for demo
        const patientCode = await generatePatientCode(prisma);
        const patient = await prisma.patient.create({
          data: {
            patientCode,
            primaryClinicId: clinic.id,
            firstName: 'Demo',
            lastName: 'Patient',
            dob: new Date('1990-05-15'),
            sex: Sex.MALE,
            phoneE164: '+233201234567',
            nationalIdType: NationalIdType.NATIONAL_ID,
            nationalIdCiphertext: encryptNationalId(nationalIdPlain),
            nationalIdHash: hashNationalId(nationalIdPlain),
            nationalIdLast4: nationalIdLast4(nationalIdPlain),
            createdByUserId: user.id,
          },
        });
        await prisma.encounter.create({
          data: {
            clinicId: clinic.id,
            patientId: patient.id,
            status: EncounterStatus.DRAFT,
            createdByUserId: user.id,
          },
        });
        await prisma.encounter.create({
          data: {
            clinicId: clinic.id,
            patientId: patient.id,
            status: EncounterStatus.IN_REVIEW,
            createdByUserId: user.id,
            preceptorReviewedById: user.id,
          },
        });
        console.log('Seeded sample patient + 2 encounters.');
      }
    } else if (seedSamplePatient && !hasEncryptionKey()) {
      console.warn(
        'SEED_SAMPLE_PATIENT=true but NATIONAL_ID_ENCRYPTION_KEY not set; skipping sample patient.',
      );
    }
  } else {
    // Create disabled research settings without updatedBy (needs a user), so skip.
    console.log(
      'SEED_SYSTEM_ADMIN_SUB not provided; seeded clinic only. Research settings will be created after first Director exists.',
    );
  }

  const e2eStaffSub = (process.env.SEED_E2E_STAFF_SUB ?? process.env.E2E_STAFF_SUB)?.trim();
  const e2eStaffName = process.env.SEED_E2E_STAFF_NAME ?? 'E2E Staff';
  const e2eStaffEmail = process.env.SEED_E2E_STAFF_EMAIL ?? 'e2e.staff@nkwapa.local';

  if (e2eStaffSub) {
    const [firstName, ...lastNameParts] = e2eStaffName.trim().split(/\s+/);
    const user = await prisma.user.upsert({
      where: { keycloakSub: e2eStaffSub },
      update: {
        displayName: e2eStaffName,
        firstName: firstName || 'E2E',
        lastName: lastNameParts.join(' ') || 'Staff',
        email: e2eStaffEmail,
        isActive: true,
      },
      create: {
        keycloakSub: e2eStaffSub,
        displayName: e2eStaffName,
        firstName: firstName || 'E2E',
        lastName: lastNameParts.join(' ') || 'Staff',
        email: e2eStaffEmail,
        isActive: true,
      },
    });
    researchSettingsOwnerId ??= user.id;

    await ensureGlobalRole(prisma, user.id, UserRole.SYSTEM_ADMIN);
    await Promise.all([
      ensureClinicRole(prisma, user.id, clinic.id, UserRole.DIRECTOR),
      ensureClinicRole(prisma, user.id, clinic.id, UserRole.DOCTOR),
      ensureClinicRole(prisma, user.id, clinic.id, UserRole.VOLUNTEER),
    ]);

    console.log('Seeded deterministic multi-role E2E staff user.');
  }

  if (researchSettingsOwnerId) {
    await ensureResearchSettings(prisma, clinic.id, researchSettingsOwnerId);
  }

  console.log({
    organizationId: organization.id,
    organizationName: organization.name,
    clinicId: clinic.id,
    clinicName: clinic.name,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
