import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  TENANT_CLINICS,
  TENANT_CROSS_CLINIC_USERS,
  TENANT_SYSTEM_ADMIN,
  tenantUser,
} from '@nkwapa/db';

/**
 * Shared harness for authorization tests that drive the real guards.
 *
 * Asserting on `@RequirePermission` metadata proves a decorator is present; it does not prove the
 * guard chain reaches the same decision. These helpers build a request and an `ExecutionContext`
 * that `ClinicScopeGuard` and `RbacGuard` can actually evaluate, so a test failure means a real
 * caller would have been allowed or denied, not merely that an annotation moved.
 *
 * Tenant identities come from `@nkwapa/db` so the API role matrix and the database
 * isolation suites describe the same organizations, clinics, and users.
 */

export interface TestActor {
  user: { id: string };
  roles: Array<{ clinicId: string | null; role: UserRole }>;
}

export interface TestRequest {
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  ip?: string;
  /** Set by `ClinicScopeGuard`; `RbacGuard` reads it to scope which roles count. */
  clinicId?: string;
  user: TestActor;
}

export const CLINIC_A1 = TENANT_CLINICS.a1.id;
export const CLINIC_A2 = TENANT_CLINICS.a2.id;
export const CLINIC_B1 = TENANT_CLINICS.b1.id;

/** Every role that can hold a clinic seat, for `it.each` matrices. */
export const CLINICAL_ROLES: readonly UserRole[] = [
  UserRole.DIRECTOR,
  UserRole.MANAGER,
  UserRole.DOCTOR,
  UserRole.VOLUNTEER,
];

export function actor(id: string, roles: TestActor['roles']): TestActor {
  return { user: { id }, roles };
}

/** A user holding exactly one role at one clinic. */
export function inClinic(role: UserRole, clinicId: string = CLINIC_A1): TestActor {
  return actor(`${clinicId}-${role.toLowerCase()}`, [{ clinicId, role }]);
}

/** Global system administrator. Holds `'*'`, but never a clinical role by itself. */
export const SYSTEM_ADMIN: TestActor = actor(TENANT_SYSTEM_ADMIN.id, [
  { clinicId: null, role: UserRole.SYSTEM_ADMIN },
]);

/** Portal patient. Must be denied on every staff surface. */
export const PORTAL_PATIENT: TestActor = actor('gate-portal-patient', [
  { clinicId: CLINIC_A1, role: UserRole.PATIENT },
]);

/** A doctor at a different organization entirely. */
export const OUTSIDER: TestActor = actor(TENANT_CROSS_CLINIC_USERS.volunteerAtB1.id, [
  { clinicId: CLINIC_B1, role: UserRole.DOCTOR },
]);

/**
 * Manager at clinic A1 who also volunteers at clinic B1.
 *
 * `ClinicScopeGuard` and `RbacGuard` both admit this user to A1 on the manager seat. Any service
 * that then checks a permission against the whole role array will read the B1 volunteer seat and
 * grant clinical writes at A1. Tests use this actor to pin that it does not happen.
 */
export const CROSS_CLINIC_MANAGER_VOLUNTEER: TestActor = actor(
  TENANT_CROSS_CLINIC_USERS.managerAtA1VolunteerAtB1.id,
  [
    { clinicId: CLINIC_A1, role: UserRole.MANAGER },
    { clinicId: CLINIC_B1, role: UserRole.VOLUNTEER },
  ],
);

/** Director at A1 who is also a doctor at A2, within one organization. */
export const CROSS_CLINIC_DIRECTOR_DOCTOR: TestActor = actor(
  TENANT_CROSS_CLINIC_USERS.directorAtA1DoctorAtA2.id,
  [
    { clinicId: CLINIC_A1, role: UserRole.DIRECTOR },
    { clinicId: CLINIC_A2, role: UserRole.DOCTOR },
  ],
);

/** The database fixture's seat holder for a clinic, when a test needs the persisted identity. */
export { tenantUser };

export function buildRequest(user: TestActor, overrides: Partial<TestRequest> = {}): TestRequest {
  return {
    params: { clinicId: CLINIC_A1 },
    query: {},
    headers: {},
    ...overrides,
    user,
  };
}

/**
 * An `ExecutionContext` pointing at one controller handler, so `Reflector` resolves the real
 * `@ClinicScoped` and `@RequirePermission` metadata for that route.
 */
export function createExecutionContext<TController extends object>(
  controller: TController,
  handlerName: keyof TController,
  request: TestRequest,
): ExecutionContext {
  return {
    getHandler: () => controller[handlerName] as unknown as (...args: unknown[]) => unknown,
    getClass: () => controller.constructor as new (...args: unknown[]) => unknown,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}
