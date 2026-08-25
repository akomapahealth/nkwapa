/**
 * The canonical multi-tenant fixture for the clinical-records release gate.
 *
 * Every isolation, RBAC, and offline-replay suite describes the same world so that a failure in
 * one layer is directly comparable to a failure in another: two organizations, three clinics, one
 * user per role per clinic, and the deliberate cross-clinic role holders that make sideways
 * privilege leaks observable.
 *
 * All identifiers and values here are synthetic. No real patient data belongs in this file, in any
 * fixture derived from it, or in release evidence that quotes it.
 */

export type TenantFixtureRole =
  | 'SYSTEM_ADMIN'
  | 'DIRECTOR'
  | 'MANAGER'
  | 'DOCTOR'
  | 'VOLUNTEER'
  | 'PATIENT';

export interface TenantFixtureOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface TenantFixtureClinic {
  id: string;
  organizationId: string;
  name: string;
  locationCode: string;
}

export interface TenantFixtureRoleGrant {
  /** `null` is a global grant, which only SYSTEM_ADMIN is expected to hold. */
  clinicId: string | null;
  role: TenantFixtureRole;
}

export interface TenantFixtureUser {
  id: string;
  keycloakSub: string;
  displayName: string;
  roles: TenantFixtureRoleGrant[];
}

export interface TenantFixturePatient {
  id: string;
  clinicId: string;
  patientCode: string;
  firstName: string;
  lastName: string;
}

const ORG_A_ID = 'aa000000-0000-4000-8000-000000000001';
const ORG_B_ID = 'bb000000-0000-4000-8000-000000000001';

export const TENANT_ORGANIZATIONS = {
  orgA: { id: ORG_A_ID, name: 'Gate Org A', slug: 'gate-org-a' },
  orgB: { id: ORG_B_ID, name: 'Gate Org B', slug: 'gate-org-b' },
} as const satisfies Record<string, TenantFixtureOrganization>;

export const TENANT_CLINICS = {
  /** Primary clinic. Most allowed-path assertions run here. */
  a1: {
    id: 'aa000000-0000-4000-8000-0000000000a1',
    organizationId: ORG_A_ID,
    name: 'Gate Clinic A1',
    locationCode: 'gate-a1',
  },
  /** Same organization, different clinic. Proves clinic isolation inside one tenant. */
  a2: {
    id: 'aa000000-0000-4000-8000-0000000000a2',
    organizationId: ORG_A_ID,
    name: 'Gate Clinic A2',
    locationCode: 'gate-a2',
  },
  /** Different organization. Proves tenant isolation across organizations. */
  b1: {
    id: 'bb000000-0000-4000-8000-0000000000b1',
    organizationId: ORG_B_ID,
    name: 'Gate Clinic B1',
    locationCode: 'gate-b1',
  },
} as const satisfies Record<string, TenantFixtureClinic>;

/** Roles that hold a clinic-scoped seat. `PATIENT` is portal-only and is granted separately. */
export const TENANT_CLINICAL_ROLES = [
  'DIRECTOR',
  'MANAGER',
  'DOCTOR',
  'VOLUNTEER',
] as const satisfies readonly TenantFixtureRole[];

function seatUser(
  clinicKey: string,
  clinicId: string,
  role: TenantFixtureRole,
  seq: number,
): TenantFixtureUser {
  const slug = `${clinicKey}-${role.toLowerCase()}`;
  return {
    id: `cc000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    keycloakSub: `gate-${slug}`,
    displayName: `Gate ${clinicKey.toUpperCase()} ${role}`,
    roles: [{ clinicId, role }],
  };
}

const seatUsers: TenantFixtureUser[] = Object.entries(TENANT_CLINICS).flatMap(
  ([clinicKey, clinic], clinicIndex) =>
    TENANT_CLINICAL_ROLES.map((role, roleIndex) =>
      seatUser(clinicKey, clinic.id, role, clinicIndex * 10 + roleIndex + 1),
    ),
);

/**
 * Users whose role set spans clinics.
 *
 * These exist because a permission check that reads the whole role array instead of the roles held
 * at the clinic being written grants privileges sideways. Without a user shaped like this, that
 * class of bug is invisible to every single-clinic test.
 */
export const TENANT_CROSS_CLINIC_USERS = {
  /** Manager at A1, volunteer at B1. Must never gain volunteer clinical writes at A1. */
  managerAtA1VolunteerAtB1: {
    id: 'cc000000-0000-4000-8000-000000000901',
    keycloakSub: 'gate-cross-manager-volunteer',
    displayName: 'Gate Cross Manager Volunteer',
    roles: [
      { clinicId: TENANT_CLINICS.a1.id, role: 'MANAGER' },
      { clinicId: TENANT_CLINICS.b1.id, role: 'VOLUNTEER' },
    ],
  },
  /** Director at A1, doctor at A2. Same organization, so only clinic scope separates them. */
  directorAtA1DoctorAtA2: {
    id: 'cc000000-0000-4000-8000-000000000902',
    keycloakSub: 'gate-cross-director-doctor',
    displayName: 'Gate Cross Director Doctor',
    roles: [
      { clinicId: TENANT_CLINICS.a1.id, role: 'DIRECTOR' },
      { clinicId: TENANT_CLINICS.a2.id, role: 'DOCTOR' },
    ],
  },
  /** Volunteer at B1 only. The canonical outsider for clinic A assertions. */
  volunteerAtB1: {
    id: 'cc000000-0000-4000-8000-000000000903',
    keycloakSub: 'gate-outsider-volunteer',
    displayName: 'Gate Outsider Volunteer',
    roles: [{ clinicId: TENANT_CLINICS.b1.id, role: 'VOLUNTEER' }],
  },
} as const satisfies Record<string, TenantFixtureUser>;

export const TENANT_SYSTEM_ADMIN: TenantFixtureUser = {
  id: 'cc000000-0000-4000-8000-000000000900',
  keycloakSub: 'gate-system-admin',
  displayName: 'Gate System Admin',
  roles: [{ clinicId: null, role: 'SYSTEM_ADMIN' }],
};

export const TENANT_USERS: TenantFixtureUser[] = [
  TENANT_SYSTEM_ADMIN,
  ...seatUsers,
  ...Object.values(TENANT_CROSS_CLINIC_USERS),
];

/** The single-role seat holder for one clinic, e.g. `tenantUser('a1', 'DOCTOR')`. */
export function tenantUser(
  clinicKey: keyof typeof TENANT_CLINICS,
  role: (typeof TENANT_CLINICAL_ROLES)[number],
): TenantFixtureUser {
  const clinicId = TENANT_CLINICS[clinicKey].id;
  const match = seatUsers.find(
    (user) => user.roles[0].clinicId === clinicId && user.roles[0].role === role,
  );
  if (!match) throw new Error(`No fixture user for ${clinicKey}/${role}`);
  return match;
}

export const TENANT_PATIENTS = {
  a1Primary: {
    id: 'dd000000-0000-4000-8000-0000000000a1',
    clinicId: TENANT_CLINICS.a1.id,
    patientCode: 'NKP-GATE-A1-1',
    firstName: 'Ama',
    lastName: 'Gatetest',
  },
  a1Secondary: {
    id: 'dd000000-0000-4000-8000-0000000000a3',
    clinicId: TENANT_CLINICS.a1.id,
    patientCode: 'NKP-GATE-A1-2',
    firstName: 'Kofi',
    lastName: 'Gatetest',
  },
  a2Primary: {
    id: 'dd000000-0000-4000-8000-0000000000a2',
    clinicId: TENANT_CLINICS.a2.id,
    patientCode: 'NKP-GATE-A2-1',
    firstName: 'Adwoa',
    lastName: 'Gatetest',
  },
  b1Primary: {
    id: 'dd000000-0000-4000-8000-0000000000b1',
    clinicId: TENANT_CLINICS.b1.id,
    patientCode: 'NKP-GATE-B1-1',
    firstName: 'Yaa',
    lastName: 'Gatetest',
  },
} as const satisfies Record<string, TenantFixturePatient>;

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Raw SQL that materializes the fixture, for the `pg`-client integration suites that replay
 * migrations into a throwaway database and therefore cannot use the Prisma client.
 *
 * Written as plain inserts rather than upserts so that a fixture collision fails loudly instead of
 * silently reusing rows from a previous run.
 */
export function tenantFixtureSql(): string {
  const statements: string[] = [];

  for (const org of Object.values(TENANT_ORGANIZATIONS)) {
    statements.push(
      `INSERT INTO "Organization" ("id", "name", "slug", "updatedAt") VALUES (${sqlLiteral(org.id)}, ${sqlLiteral(org.name)}, ${sqlLiteral(org.slug)}, CURRENT_TIMESTAMP);`,
    );
  }

  for (const clinic of Object.values(TENANT_CLINICS)) {
    statements.push(
      `INSERT INTO "Clinic" ("id", "organizationId", "name", "timezone", "locationCode", "updatedAt") VALUES (${sqlLiteral(clinic.id)}, ${sqlLiteral(clinic.organizationId)}, ${sqlLiteral(clinic.name)}, 'Africa/Accra', ${sqlLiteral(clinic.locationCode)}, CURRENT_TIMESTAMP);`,
    );
  }

  let roleSeq = 0;
  for (const user of TENANT_USERS) {
    statements.push(
      `INSERT INTO "User" ("id", "keycloakSub", "displayName", "updatedAt") VALUES (${sqlLiteral(user.id)}, ${sqlLiteral(user.keycloakSub)}, ${sqlLiteral(user.displayName)}, CURRENT_TIMESTAMP);`,
    );
    for (const grant of user.roles) {
      roleSeq += 1;
      const roleId = `ee000000-0000-4000-8000-${String(roleSeq).padStart(12, '0')}`;
      const clinicValue = grant.clinicId === null ? 'NULL' : sqlLiteral(grant.clinicId);
      statements.push(
        `INSERT INTO "UserClinicRole" ("id", "userId", "clinicId", "role") VALUES (${sqlLiteral(roleId)}, ${sqlLiteral(user.id)}, ${clinicValue}, '${grant.role}');`,
      );
    }
  }

  for (const patient of Object.values(TENANT_PATIENTS)) {
    statements.push(
      `INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "updatedAt") VALUES (${sqlLiteral(patient.id)}, ${sqlLiteral(patient.patientCode)}, ${sqlLiteral(patient.clinicId)}, ${sqlLiteral(patient.firstName)}, ${sqlLiteral(patient.lastName)}, 'OTHER', ${sqlLiteral(`ciphertext-${patient.patientCode}`)}, ${sqlLiteral(`hash-${patient.patientCode}`)}, '0000', CURRENT_TIMESTAMP);`,
    );
  }

  return statements.join('\n');
}
