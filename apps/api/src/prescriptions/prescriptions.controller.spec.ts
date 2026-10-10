import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import {
  CLINIC_SCOPED_KEY,
  CLINIC_ID_SOURCE_KEY,
} from '../auth/decorators/clinic-scoped.decorator';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { roleHolds } from '../testing/clinical-record-surfaces';
import { PrescriptionsController } from './prescriptions.controller';

/**
 * Who may prescribe, asserted where it is decided.
 *
 * `PrescriptionService` holds no permission logic of its own: every restriction on this record
 * lives in the decorators below, and until this spec existed none of them was asserted anywhere.
 * Deleting `@RequirePermission(PRESCRIPTION.WRITE)` from the create route left the whole suite
 * green, which is not a property a doctor-only clinical write should have.
 *
 * The metadata is read rather than the routes being driven, because the decorator is the thing
 * under test. A request-level test would prove the guard works, which is already covered by
 * `RbacGuard`'s own spec; this proves the guard is asked the right question on every route.
 */
describe('PrescriptionsController', () => {
  const ROUTES = [
    ['create', PERMISSIONS.PRESCRIPTION_WRITE],
    ['listByEncounter', PERMISSIONS.PRESCRIPTION_READ],
    ['update', PERMISSIONS.PRESCRIPTION_WRITE],
    ['remove', PERMISSIONS.PRESCRIPTION_WRITE],
  ] as const;

  /** Every handler on the controller, so a route added later cannot skip this spec. */
  function handlerNames(): string[] {
    return Object.getOwnPropertyNames(PrescriptionsController.prototype).filter(
      (name) => name !== 'constructor',
    );
  }

  it.each(ROUTES)('requires %s to hold %s', (method, permission) => {
    expect(
      Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        PrescriptionsController.prototype[method as keyof PrescriptionsController],
      ),
    ).toBe(permission);
  });

  it('leaves no route unpermissioned', () => {
    // A new route that nobody decided a permission for would otherwise be reachable by any
    // authenticated user the clinic scope admits.
    const undecided = handlerNames().filter(
      (name) =>
        Reflect.getMetadata(
          REQUIRE_PERMISSION_KEY,
          PrescriptionsController.prototype[name as keyof PrescriptionsController],
        ) === undefined,
    );
    expect(undecided).toEqual([]);
  });

  it('covers every route this controller exposes', () => {
    // Keeps the table above honest as the controller grows.
    expect(handlerNames().sort()).toEqual(ROUTES.map(([method]) => method).sort());
  });

  it('scopes every route to the clinic in the path', () => {
    for (const name of handlerNames()) {
      const handler = PrescriptionsController.prototype[name as keyof PrescriptionsController];
      expect([name, Reflect.getMetadata(CLINIC_SCOPED_KEY, handler)]).toEqual([name, true]);
      expect([name, Reflect.getMetadata(CLINIC_ID_SOURCE_KEY, handler)]).toEqual([
        name,
        { type: 'param', paramKey: 'clinicId' },
      ]);
    }
  });

  it('runs authentication, clinic scope and RBAC on the controller', () => {
    // The permission metadata decides nothing if the guard that reads it is not mounted.
    expect(Reflect.getMetadata('__guards__', PrescriptionsController)).toEqual([
      JwtAuthGuard,
      ClinicScopeGuard,
      RbacGuard,
    ]);
  });

  /*
    Writing a prescription is a doctor's act.

    A director and a manager may read the record; a volunteer may not touch it at all, though it
    does hold DRUG.READ so it can see the catalogue. This spec fails if a role gains the write
    permission, which is the change most likely to be made by accident while editing the role
    table.
  */
  it('grants the write only to doctors', () => {
    const writers = Object.values(UserRole).filter((role) =>
      roleHolds(role, PERMISSIONS.PRESCRIPTION_WRITE),
    );
    expect(writers.sort()).toEqual([UserRole.DOCTOR, UserRole.SYSTEM_ADMIN].sort());
  });

  it('grants the read to the roles that supervise, and to no one else', () => {
    const readers = Object.values(UserRole).filter((role) =>
      roleHolds(role, PERMISSIONS.PRESCRIPTION_READ),
    );
    expect(readers.sort()).toEqual(
      [UserRole.DIRECTOR, UserRole.MANAGER, UserRole.DOCTOR, UserRole.SYSTEM_ADMIN].sort(),
    );
  });

  it('keeps a volunteer out of prescribing while leaving it the catalogue', () => {
    expect(roleHolds(UserRole.VOLUNTEER, PERMISSIONS.PRESCRIPTION_WRITE)).toBe(false);
    expect(roleHolds(UserRole.VOLUNTEER, PERMISSIONS.PRESCRIPTION_READ)).toBe(false);
    // It still reads the catalogue, which is what the medication interview's grouping needs.
    expect(roleHolds(UserRole.VOLUNTEER, PERMISSIONS.DRUG_READ)).toBe(true);
  });

  it('keeps a patient out of the prescribing surface entirely', () => {
    for (const permission of [PERMISSIONS.PRESCRIPTION_READ, PERMISSIONS.PRESCRIPTION_WRITE]) {
      expect([permission, roleHolds(UserRole.PATIENT, permission)]).toEqual([permission, false]);
    }
  });

  it('does not let a reader write by reusing one permission for both', () => {
    expect(PERMISSIONS.PRESCRIPTION_READ).not.toBe(PERMISSIONS.PRESCRIPTION_WRITE);
  });
});
