// packages/db/prisma/seed.ts
import "dotenv/config";
import { PrismaClient, UserRole, Sex, NationalIdType, EncounterStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  encryptNationalId,
  hashNationalId,
  nationalIdLast4,
  hasEncryptionKey,
  generatePatientCode,
} from "../index";
import { seedDrugs } from "./seed-drugs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const clinicName = process.env.SEED_CLINIC_NAME ?? "Nkwapa Clinic - Demo";
  const clinicRegion = process.env.SEED_CLINIC_REGION ?? "Greater Accra";
  const clinicCountry = process.env.SEED_CLINIC_COUNTRY ?? "GH";

  // Clinic.name is not unique; use findFirst + create/update instead of upsert
  let clinic = await prisma.clinic.findFirst({
    where: { name: clinicName },
  });
  if (clinic) {
    clinic = await prisma.clinic.update({
      where: { id: clinic.id },
      data: { region: clinicRegion, countryCode: clinicCountry, isActive: true },
    });
  } else {
    clinic = await prisma.clinic.create({
      data: {
        name: clinicName,
        region: clinicRegion,
        countryCode: clinicCountry,
        isActive: true,
      },
    });
  }

  const sysAdminSub = process.env.SEED_SYSTEM_ADMIN_SUB;
  const sysAdminName = process.env.SEED_SYSTEM_ADMIN_NAME ?? "System Admin";

  if (sysAdminSub) {
    const user = await prisma.user.upsert({
      where: { keycloakSub: sysAdminSub },
      update: { displayName: sysAdminName, isActive: true },
      create: { keycloakSub: sysAdminSub, displayName: sysAdminName, isActive: true },
    });

    // Global SYSTEM_ADMIN role (clinicId = null)
    // Prisma upsert doesn't support null in compound unique; use findFirst + create
    const existingSystemAdmin = await prisma.userClinicRole.findFirst({
      where: { userId: user.id, clinicId: null, role: UserRole.SYSTEM_ADMIN },
    });
    if (!existingSystemAdmin) {
      await prisma.userClinicRole.create({
        data: { userId: user.id, clinicId: null, role: UserRole.SYSTEM_ADMIN },
      });
    }

    // Also give a DIRECTOR role for demo on the demo clinic (optional convenience)
    await prisma.userClinicRole.upsert({
      where: { userId_clinicId_role: { userId: user.id, clinicId: clinic.id, role: UserRole.DIRECTOR } },
      update: {},
      create: { userId: user.id, clinicId: clinic.id, role: UserRole.DIRECTOR },
    });

    // Default research settings for clinic
    await prisma.clinicResearchSettings.upsert({
      where: { clinicId: clinic.id },
      update: { updatedByUserId: user.id, researchEnabled: false, requiresDirectorApprovalEachExport: true },
      create: {
        clinicId: clinic.id,
        updatedByUserId: user.id,
        researchEnabled: false,
        requiresDirectorApprovalEachExport: true,
      },
    });

    // Seed drug catalog for the clinic
    await seedDrugs(prisma, clinic.id);

    console.log("Seeded clinic + system admin user + roles + clinic research settings.");

    // Sample patient + encounters when SEED_SAMPLE_PATIENT=true and encryption key is set
    const seedSamplePatient = process.env.SEED_SAMPLE_PATIENT === "true";
    if (seedSamplePatient && hasEncryptionKey()) {
      const existingDemo = await prisma.patient.findFirst({
        where: {
          primaryClinicId: clinic.id,
          firstName: "Demo",
          lastName: "Patient",
        },
      });
      if (existingDemo) {
        console.log("Sample patient already exists; skipping.");
      } else {
        const nationalIdPlain = "GH-123456789-0"; // placeholder for demo
        const patientCode = await generatePatientCode(prisma);
        const patient = await prisma.patient.create({
          data: {
            patientCode,
            primaryClinicId: clinic.id,
            firstName: "Demo",
            lastName: "Patient",
            dob: new Date("1990-05-15"),
            sex: Sex.MALE,
            phoneE164: "+233201234567",
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
        console.log("Seeded sample patient + 2 encounters.");
      }
    } else if (seedSamplePatient && !hasEncryptionKey()) {
      console.warn(
        "SEED_SAMPLE_PATIENT=true but NATIONAL_ID_ENCRYPTION_KEY not set; skipping sample patient."
      );
    }
  } else {
    // Create disabled research settings without updatedBy (needs a user), so skip.
    console.log("SEED_SYSTEM_ADMIN_SUB not provided; seeded clinic only. Research settings will be created after first Director exists.");
  }

  console.log({ clinicId: clinic.id, clinicName: clinic.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
