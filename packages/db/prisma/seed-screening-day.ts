// packages/db/prisma/seed-screening-day.ts
/**
 * A synthetic screening day for the landing page's product screenshots (MASTER section 12,
 * "Public site frame and product screenshots"). Invented Ghanaian names, patients spread along the
 * station line with waits backdated from now, staff on shifts. Never real patients.
 *
 * TENANT SAFETY: it renames the e2e accounts and writes backdated rows, so it refuses any database
 * whose name does not end in `_shots`. Run it on a fresh throwaway database after the base seed:
 *
 *   createdb nkwapa_shots; npm run db:migrate:deploy; npm run db:seed:local (SEED_SAMPLE_*=true)
 *   npx ts-node --transpile-only packages/db/prisma/seed-screening-day.ts
 *
 * Waits are relative to the run (or SHOTS_NOW), so seed shortly before capturing, and drop the
 * database after.
 */
import { config as loadDotenv } from 'dotenv';
import {
  CheckInStatus,
  EncounterStatus,
  NationalIdType,
  PrismaClient,
  Sex,
  ShiftRole,
  ShiftStatus,
  StationKind,
  StationVisitStatus,
  UserRole,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { encryptNationalId, generatePatientCode, hashNationalId, nationalIdLast4 } from '../index';

loadDotenv();

const ROUTE: StationKind[] = [
  StationKind.INTAKE,
  StationKind.BLOOD_PRESSURE,
  StationKind.GLUCOSE,
  StationKind.ANTHROPOMETRY,
  StationKind.EYE,
  StationKind.REVIEW,
];

/** Where each patient is now and for how long, in minutes. Two past 20 minutes at review. */
const LINE: {
  first: string;
  last: string;
  sex: Sex;
  at: StationKind;
  waiting: number;
  bp: [number, number];
}[] = [
  {
    first: 'Kwabena',
    last: 'Frimpong',
    sex: Sex.MALE,
    at: StationKind.INTAKE,
    waiting: 6,
    bp: [128, 82],
  },
  {
    first: 'Esi',
    last: 'Bonsu',
    sex: Sex.FEMALE,
    at: StationKind.INTAKE,
    waiting: 4,
    bp: [118, 76],
  },
  {
    first: 'Kojo',
    last: 'Appiah',
    sex: Sex.MALE,
    at: StationKind.BLOOD_PRESSURE,
    waiting: 10,
    bp: [136, 88],
  },
  {
    first: 'Adwoa',
    last: 'Sarpong',
    sex: Sex.FEMALE,
    at: StationKind.BLOOD_PRESSURE,
    waiting: 8,
    bp: [124, 80],
  },
  {
    first: 'Kwesi',
    last: 'Amoah',
    sex: Sex.MALE,
    at: StationKind.BLOOD_PRESSURE,
    waiting: 7,
    bp: [142, 90],
  },
  {
    first: 'Yaw',
    last: 'Darko',
    sex: Sex.MALE,
    at: StationKind.GLUCOSE,
    waiting: 12,
    bp: [138, 86],
  },
  {
    first: 'Abena',
    last: 'Ofori',
    sex: Sex.FEMALE,
    at: StationKind.GLUCOSE,
    waiting: 10,
    bp: [122, 78],
  },
  {
    first: 'Kofi',
    last: 'Asamoah',
    sex: Sex.MALE,
    at: StationKind.ANTHROPOMETRY,
    waiting: 16,
    bp: [131, 84],
  },
  {
    first: 'Efua',
    last: 'Quaye',
    sex: Sex.FEMALE,
    at: StationKind.ANTHROPOMETRY,
    waiting: 13,
    bp: [126, 79],
  },
  { first: 'Ama', last: 'Owusu', sex: Sex.FEMALE, at: StationKind.EYE, waiting: 18, bp: [133, 85] },
  {
    first: 'Akosua',
    last: 'Mensah',
    sex: Sex.FEMALE,
    at: StationKind.REVIEW,
    waiting: 27,
    bp: [148, 94],
  },
  {
    first: 'Kwame',
    last: 'Boateng',
    sex: Sex.MALE,
    at: StationKind.REVIEW,
    waiting: 21,
    bp: [144, 92],
  },
];

/** The e2e accounts keep their logins; only the names people see change. */
const RENAME: Record<string, [string, string]> = {
  'e2e.volunteer@nkwapa.local': ['Nana', 'Adjei'],
  'e2e.doctor@nkwapa.local': ['Afia', 'Boakye'],
  'e2e.manager@nkwapa.local': ['Yaa', 'Asante'],
  'e2e.director@nkwapa.local': ['Kofi', 'Owusu'],
  'e2e.staff@nkwapa.local': ['Kwame', 'Ntim'],
  'e2e.patient@nkwapa.local': ['Ama', 'Serwaa'],
};

/**
 * SHOTS_NOW (an ISO instant earlier today, e.g. 10:40 clinic time) seeds the day around a clinic
 * morning; the capture spec freezes the browser clock to the same instant. Without it, now.
 */
const NOW = process.env.SHOTS_NOW ? new Date(process.env.SHOTS_NOW).getTime() : Date.now();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000);

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const dbName = url.split('?')[0].split('/').pop() ?? '';
  if (!dbName.endsWith('_shots')) {
    console.error(
      `Refusing: this seed only runs on a throwaway *_shots database, not "${dbName}".`,
    );
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, options: '-c app.is_system_admin=true' }),
  });
  try {
    const clinic = await prisma.clinic.findFirstOrThrow({
      where: { name: 'Nkwapa Clinic - Demo' },
    });
    if (await prisma.patient.findFirst({ where: { firstName: 'Akosua', lastName: 'Mensah' } })) {
      console.error('Already seeded: drop and recreate the *_shots database for a fresh day.');
      process.exitCode = 1;
      return;
    }
    const stations = await prisma.clinicStation.findMany({ where: { clinicId: clinic.id } });
    const station = (kind: StationKind) => stations.find((s) => s.kind === kind)!;

    for (const [email, [firstName, lastName]] of Object.entries(RENAME)) {
      await prisma.user.updateMany({
        where: { email },
        data: { firstName, lastName, displayName: `${firstName} ${lastName}` },
      });
    }
    const user = (email: string) => prisma.user.findFirstOrThrow({ where: { email } });
    const volunteer = await user('e2e.volunteer@nkwapa.local');
    const doctor = await user('e2e.doctor@nkwapa.local');
    const portalUser = await user('e2e.patient@nkwapa.local');
    await prisma.patient.updateMany({
      where: { portalUserId: portalUser.id },
      data: { firstName: 'Ama', lastName: 'Serwaa' },
    });

    // Two more volunteers, without logins: they only appear on the line.
    const extra = async (sub: string, firstName: string, lastName: string) => {
      const created = await prisma.user.create({
        data: { keycloakSub: sub, firstName, lastName, displayName: `${firstName} ${lastName}` },
      });
      await prisma.userClinicRole.create({
        data: { userId: created.id, clinicId: clinic.id, role: UserRole.VOLUNTEER },
      });
      return created;
    };
    const esi = await extra('shots-esi-nyarko', 'Esi', 'Nyarko');
    const yaw = await extra('shots-yaw-ansah', 'Yaw', 'Ansah');

    // Anthropometry and the eye station are left unstaffed: the manager's "needs you now".
    const shifts: [string, ShiftRole, StationKind][] = [
      [esi.id, ShiftRole.VOLUNTEER, StationKind.INTAKE],
      [volunteer.id, ShiftRole.VOLUNTEER, StationKind.BLOOD_PRESSURE],
      [yaw.id, ShiftRole.VOLUNTEER, StationKind.GLUCOSE],
      [doctor.id, ShiftRole.DOCTOR, StationKind.REVIEW],
    ];
    for (const [userId, roleAtShift, kind] of shifts) {
      await prisma.staffShift.create({
        data: {
          clinicId: clinic.id,
          userId,
          roleAtShift,
          checkedInAt: minutesAgo(180),
          status: ShiftStatus.ACTIVE,
          stationId: station(kind).id,
        },
      });
    }
    const stationStaff: Partial<Record<StationKind, string>> = {
      [StationKind.INTAKE]: esi.id,
      [StationKind.BLOOD_PRESSURE]: volunteer.id,
      [StationKind.GLUCOSE]: yaw.id,
      [StationKind.ANTHROPOMETRY]: yaw.id,
      [StationKind.EYE]: volunteer.id,
    };

    for (const [index, entry] of LINE.entries()) {
      const nationalId = `GH-SHOTS-${String(index + 1).padStart(3, '0')}`;
      const patient = await prisma.patient.create({
        data: {
          patientCode: await generatePatientCode(prisma),
          primaryClinicId: clinic.id,
          firstName: entry.first,
          lastName: entry.last,
          dob: new Date(Date.UTC(1950 + ((index * 7) % 30), index % 12, 3 + index)),
          sex: entry.sex,
          nationalIdType: NationalIdType.NATIONAL_ID,
          nationalIdCiphertext: encryptNationalId(nationalId),
          nationalIdHash: hashNationalId(nationalId),
          nationalIdLast4: nationalIdLast4(nationalId),
          createdByUserId: esi.id,
        },
      });
      const stopsBefore = ROUTE.indexOf(entry.at);
      // Each earlier stop took eight minutes, back to back, before the current wait began.
      const checkedInAt = minutesAgo(entry.waiting + stopsBefore * 8 + 2);
      const encounter = await prisma.encounter.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          status: EncounterStatus.DRAFT,
          createdByUserId: esi.id,
          createdAt: checkedInAt,
        },
      });
      const checkIn = await prisma.patientCheckIn.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          checkedInAt,
          status: CheckInStatus.IN_PROGRESS,
          encounterId: encounter.id,
        },
      });
      for (let stop = 0; stop < stopsBefore; stop += 1) {
        const kind = ROUTE[stop];
        const queuedAt = new Date(checkedInAt.getTime() + stop * 8 * 60_000);
        const staffId = stationStaff[kind] ?? esi.id;
        const staff = [esi, volunteer, yaw].find((s) => s.id === staffId)!;
        await prisma.patientStationVisit.create({
          data: {
            clinicId: clinic.id,
            patientCheckInId: checkIn.id,
            encounterId: encounter.id,
            stationId: station(kind).id,
            status: StationVisitStatus.COMPLETED,
            queuedAt,
            queuedByUserId: esi.id,
            claimedByUserId: staffId,
            claimedAt: new Date(queuedAt.getTime() + 2 * 60_000),
            completedByUserId: staffId,
            completedAt: new Date(queuedAt.getTime() + 8 * 60_000),
            performedByIsAccountHolder: true,
            performedByName: staff.displayName,
          },
        });
        if (kind === StationKind.BLOOD_PRESSURE) {
          await prisma.vitals.create({
            data: {
              clinicId: clinic.id,
              encounterId: encounter.id,
              systolicBp: entry.bp[0],
              diastolicBp: entry.bp[1],
              pulseBpm: 72 + (index % 9),
              createdAt: new Date(queuedAt.getTime() + 8 * 60_000),
            },
          });
        }
      }
      await prisma.patientStationVisit.create({
        data: {
          clinicId: clinic.id,
          patientCheckInId: checkIn.id,
          encounterId: encounter.id,
          stationId: station(entry.at).id,
          status: StationVisitStatus.QUEUED,
          queuedAt: minutesAgo(entry.waiting),
          queuedByUserId: esi.id,
        },
      });
    }
    console.log(`Screening day seeded: ${LINE.length} patients on the line, 4 staff on shift.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
