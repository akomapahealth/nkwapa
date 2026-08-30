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
import {
  PrismaClient,
  UserRole,
  Sex,
  NationalIdType,
  EncounterStatus,
  GhanaRegion,
  PatientLocationStatus,
  AppointmentStatus,
  AppointmentRequestStatus,
  AppointmentRequestType,
  PatientPortalInviteStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  encryptNationalId,
  hashNationalId,
  nationalIdLast4,
  hasEncryptionKey,
  generatePatientCode,
  confirmedVisitStart,
  terminalVisitStart,
} from '../index';
import { seedDrugs } from './seed-drugs';

/**
 * Seeding creates the organization and clinic that a tenant context is later derived from, so it
 * has to run before one can exist. Every tenant-scoped table forces row level security, and the
 * insert policies require `app.is_system_admin`, so the flag is set as a connection option: that
 * applies it when each pooled connection is opened rather than relying on which connection a
 * given statement happens to get.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
  options: '-c app.is_system_admin=true',
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

/**
 * A staff identity holding exactly one clinic role.
 *
 * The multi-role E2E user is convenient for walking the product and useless for proving what a
 * single role can see, because it holds every role at once. These identities exist so the browser
 * can show what a doctor and a volunteer actually get, including what they are refused.
 */
async function ensureSingleRoleUser(params: {
  sub: string;
  displayName: string;
  email: string;
  clinicId: string;
  role: UserRole;
}) {
  const [firstName, ...lastNameParts] = params.displayName.trim().split(/\s+/);
  const user = await prisma.user.upsert({
    where: { keycloakSub: params.sub },
    update: {
      displayName: params.displayName,
      firstName: firstName || 'E2E',
      lastName: lastNameParts.join(' ') || 'User',
      email: params.email,
      isActive: true,
    },
    create: {
      keycloakSub: params.sub,
      displayName: params.displayName,
      firstName: firstName || 'E2E',
      lastName: lastNameParts.join(' ') || 'User',
      email: params.email,
      isActive: true,
    },
  });

  await ensureClinicRole(prisma, user.id, params.clinicId, params.role);
  return user;
}

/**
 * A deterministic appointment fixture set for the acceptance suite.
 *
 * Nothing seeds appointments today, which is why the workflow had no end-to-end coverage: a
 * confirmed appointment can only be created by confirming a request, and until this release no
 * staff screen could do that. Rather than leave the suite unable to reach its own subject, seed one
 * appointment in each state plus the two request shapes a patient can open.
 *
 * Times are placed against the Monday-start week the staff schedule renders, not against the
 * clock, because the schedule only ever shows the week containing today. See
 * `src/appointment-fixture-window.ts`.
 *
 * The guard below is on the demo *patient*, not on the appointments, so deleting appointments
 * alone will not cause this to run again -- remove the patient, which cascades.
 */
async function seedSampleAppointments(
  prisma: PrismaClient,
  clinicId: string,
  createdByUserId: string,
) {
  const existing = await prisma.patient.findFirst({
    where: { primaryClinicId: clinicId, firstName: 'Appointment', lastName: 'Demo' },
  });
  if (existing) {
    console.log('Sample appointments already exist; skipping.');
    return;
  }

  const nationalIdPlain = 'GH-APPT-DEMO-1';
  const patient = await prisma.patient.create({
    data: {
      patientCode: await generatePatientCode(prisma),
      primaryClinicId: clinicId,
      firstName: 'Appointment',
      lastName: 'Demo',
      dob: new Date('1985-02-11'),
      sex: Sex.FEMALE,
      phoneE164: '+233200000111',
      nationalIdType: NationalIdType.NATIONAL_ID,
      nationalIdCiphertext: encryptNationalId(nationalIdPlain),
      nationalIdHash: hashNationalId(nationalIdPlain),
      nationalIdLast4: nationalIdLast4(nationalIdPlain),
      createdByUserId,
      residentialLocationStatus: PatientLocationStatus.RECORDED,
      residentialRegion: GhanaRegion.GREATER_ACCRA,
      residentialDistrict: 'Accra Metropolitan',
      residentialCommunity: 'Osu',
    },
  });

  const hours = (offset: number) => new Date(Date.now() + offset * 60 * 60 * 1000);
  const dateOnly = (date: Date) => new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const plusHours = (from: Date, offset: number) =>
    new Date(from.getTime() + offset * 60 * 60 * 1000);

  /*
    Placed against the week the schedule actually shows, not against the clock.

    The staff schedule renders exactly one Monday-start week, the one containing today. These
    fixtures used to sit at `now + 26h` and `now - 48h`, which fall outside that week near its
    edges -- the confirmed row crossed into next Monday on any Sunday, and the terminal rows fell
    into the previous week on a Monday or Tuesday. See appointment-fixture-window.ts, which keeps
    the original offsets wherever they are safe and clamps them where they are not.
  */
  const seededAt = new Date();
  const confirmedStart = confirmedVisitStart(seededAt);
  const terminalStart = terminalVisitStart(seededAt);

  // Confirmed and still ahead: the row every lifecycle action is applied to.
  const confirmed = await prisma.appointment.create({
    data: {
      clinicId,
      patientId: patient.id,
      startsAt: confirmedStart,
      endsAt: plusHours(confirmedStart, 1),
      status: AppointmentStatus.CONFIRMED,
      notes: 'Blood pressure review',
    },
  });

  // One row in each terminal state, so the schedule filters and the read-only rendering have
  // something to show without a test having to create them first.
  await prisma.appointment.createMany({
    data: [
      // Staggered by an hour rather than by a day: a day apart put the older two outside the
      // visible week for most of it, and nothing depends on the spacing, only on the statuses.
      {
        clinicId,
        patientId: patient.id,
        startsAt: terminalStart,
        endsAt: plusHours(terminalStart, 1),
        status: AppointmentStatus.COMPLETED,
        notes: 'Reviewed home readings',
      },
      {
        clinicId,
        patientId: patient.id,
        startsAt: plusHours(terminalStart, 1),
        endsAt: plusHours(terminalStart, 2),
        status: AppointmentStatus.CANCELLED,
      },
      {
        clinicId,
        patientId: patient.id,
        startsAt: plusHours(terminalStart, 2),
        endsAt: plusHours(terminalStart, 3),
        status: AppointmentStatus.NO_SHOW,
      },
    ],
  });

  // Two requests awaiting triage: a new visit, and a change against the confirmed appointment.
  await prisma.appointmentRequest.create({
    data: {
      clinicId,
      patientId: patient.id,
      requestType: AppointmentRequestType.NEW_APPOINTMENT,
      preferredStartDate: dateOnly(hours(24 * 7)),
      preferredEndDate: dateOnly(hours(24 * 10)),
      reason: 'Routine follow-up',
      status: AppointmentRequestStatus.REQUESTED,
    },
  });
  await prisma.appointmentRequest.create({
    data: {
      clinicId,
      patientId: patient.id,
      requestType: AppointmentRequestType.RESCHEDULE_APPOINTMENT,
      sourceAppointmentId: confirmed.id,
      preferredStartDate: dateOnly(hours(24 * 14)),
      preferredEndDate: dateOnly(hours(24 * 17)),
      reason: 'Travelling that week',
      status: AppointmentRequestStatus.REQUESTED,
    },
  });

  console.log('Seeded appointment demo patient, 4 appointments, and 2 pending requests.');
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
            // Demonstrates a deliberately recorded residential location. Other
            // patients default to NOT_RECORDED (the safe migration state).
            residentialLocationStatus: PatientLocationStatus.RECORDED,
            residentialRegion: GhanaRegion.GREATER_ACCRA,
            residentialDistrict: 'Accra Metropolitan',
            residentialCommunity: 'Osu',
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

  const e2eDoctorSub = (process.env.SEED_E2E_DOCTOR_SUB ?? process.env.E2E_DOCTOR_SUB)?.trim();
  if (e2eDoctorSub) {
    await ensureSingleRoleUser({
      sub: e2eDoctorSub,
      displayName: process.env.SEED_E2E_DOCTOR_NAME ?? 'E2E Doctor',
      email: process.env.SEED_E2E_DOCTOR_EMAIL ?? 'e2e.doctor@nkwapa.local',
      clinicId: clinic.id,
      role: UserRole.DOCTOR,
    });
    console.log('Seeded deterministic single-role E2E doctor.');
  }

  const e2eVolunteerSub = (
    process.env.SEED_E2E_VOLUNTEER_SUB ?? process.env.E2E_VOLUNTEER_SUB
  )?.trim();
  if (e2eVolunteerSub) {
    await ensureSingleRoleUser({
      sub: e2eVolunteerSub,
      displayName: process.env.SEED_E2E_VOLUNTEER_NAME ?? 'E2E Volunteer',
      email: process.env.SEED_E2E_VOLUNTEER_EMAIL ?? 'e2e.volunteer@nkwapa.local',
      clinicId: clinic.id,
      role: UserRole.VOLUNTEER,
    });
    console.log('Seeded deterministic single-role E2E volunteer.');
  }

  /*
    The portal identity, and the patient record it opens.

    The Playwright suite had no patient, so every spec signed in as staff and the portal -- about
    2,900 lines migrated in #86 -- had no automated coverage at all. A portal user is not just a
    role: `Patient.portalUserId` is what makes the portal show a chart rather than the
    "ask your clinic to link this account" state, so the seed has to create both and join them.

    Also stages a PENDING invite for a second, unclaimed patient, which is the only way to reach
    the /claim-record screen.
  */
  const e2ePatientSub = (process.env.SEED_E2E_PATIENT_SUB ?? process.env.E2E_PATIENT_SUB)?.trim();
  if (e2ePatientSub && researchSettingsOwnerId && hasEncryptionKey()) {
    const portalUser = await ensureSingleRoleUser({
      sub: e2ePatientSub,
      displayName: process.env.SEED_E2E_PATIENT_NAME ?? 'E2E Patient',
      email: process.env.SEED_E2E_PATIENT_EMAIL ?? 'e2e.patient@nkwapa.local',
      clinicId: clinic.id,
      role: UserRole.PATIENT,
    });

    const linked = await prisma.patient.findFirst({ where: { portalUserId: portalUser.id } });
    if (linked) {
      console.log('Portal-linked E2E patient already exists; skipping.');
    } else {
      const nationalIdPlain = 'GH-E2E-PORTAL-1';
      const patient = await prisma.patient.create({
        data: {
          patientCode: await generatePatientCode(prisma),
          primaryClinicId: clinic.id,
          firstName: 'E2E',
          lastName: 'Portal',
          dob: new Date('1988-03-11'),
          sex: Sex.FEMALE,
          phoneE164: '+233201234599',
          nationalIdType: NationalIdType.NATIONAL_ID,
          nationalIdCiphertext: encryptNationalId(nationalIdPlain),
          nationalIdHash: hashNationalId(nationalIdPlain),
          nationalIdLast4: nationalIdLast4(nationalIdPlain),
          createdByUserId: researchSettingsOwnerId,
          portalUserId: portalUser.id,
          residentialLocationStatus: PatientLocationStatus.RECORDED,
          residentialRegion: GhanaRegion.GREATER_ACCRA,
          residentialDistrict: 'Accra Metropolitan',
          residentialCommunity: 'Osu',
        },
      });
      console.log(`Seeded portal-linked E2E patient ${patient.patientCode}.`);
    }

    const existingInvite = await prisma.patientPortalInvite.findFirst({
      where: { clinicId: clinic.id, status: PatientPortalInviteStatus.PENDING },
    });
    if (existingInvite) {
      console.log('Pending portal invite already exists; skipping.');
    } else {
      const invitePlain = 'GH-E2E-UNCLAIMED-1';
      const unclaimed = await prisma.patient.create({
        data: {
          patientCode: await generatePatientCode(prisma),
          primaryClinicId: clinic.id,
          firstName: 'E2E',
          lastName: 'Unclaimed',
          dob: new Date('1975-09-02'),
          sex: Sex.MALE,
          nationalIdType: NationalIdType.NATIONAL_ID,
          nationalIdCiphertext: encryptNationalId(invitePlain),
          nationalIdHash: hashNationalId(invitePlain),
          nationalIdLast4: nationalIdLast4(invitePlain),
          createdByUserId: researchSettingsOwnerId,
        },
      });
      await prisma.patientPortalInvite.create({
        data: {
          clinicId: clinic.id,
          patientId: unclaimed.id,
          status: PatientPortalInviteStatus.PENDING,
          email: process.env.SEED_E2E_CLAIM_EMAIL ?? 'e2e.claim@nkwapa.local',
          createdByUserId: researchSettingsOwnerId,
        },
      });
      console.log(`Seeded a pending portal invite for ${unclaimed.patientCode}.`);
    }
  }

  if (researchSettingsOwnerId) {
    await ensureResearchSettings(prisma, clinic.id, researchSettingsOwnerId);
  }

  const seedSampleAppointmentData = process.env.SEED_SAMPLE_APPOINTMENTS === 'true';
  if (seedSampleAppointmentData && researchSettingsOwnerId && hasEncryptionKey()) {
    await seedSampleAppointments(prisma, clinic.id, researchSettingsOwnerId);
  } else if (seedSampleAppointmentData) {
    console.warn(
      hasEncryptionKey()
        ? 'SEED_SAMPLE_APPOINTMENTS=true but no seeded staff user exists to own the records; skipping.'
        : 'SEED_SAMPLE_APPOINTMENTS=true but NATIONAL_ID_ENCRYPTION_KEY not set; skipping.',
    );
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
