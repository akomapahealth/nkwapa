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
import { DrugsController } from './drugs.controller';

/**
 * The drug catalogue: read widely, edited narrowly.
 *
 * Reading it is how the prescription picker and the chronic-disease interviews find a medicine, so
 * every clinical role holds `DRUG.READ`. Changing the catalogue is an administrative act and is
 * held by director and manager alone -- notably not by a doctor, who prescribes from it without
 * being able to edit it. Neither half was asserted anywhere before this spec.
 */
describe('DrugsController', () => {
  const ROUTES = [
    ['search', PERMISSIONS.DRUG_READ],
    ['findById', PERMISSIONS.DRUG_READ],
    ['create', PERMISSIONS.DRUG_MANAGE],
    ['update', PERMISSIONS.DRUG_MANAGE],
  ] as const;

  function handlerNames(): string[] {
    return Object.getOwnPropertyNames(DrugsController.prototype).filter(
      (name) => name !== 'constructor',
    );
  }

  it.each(ROUTES)('requires %s to hold %s', (method, permission) => {
    expect(
      Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        DrugsController.prototype[method as keyof DrugsController],
      ),
    ).toBe(permission);
  });

  it('leaves no route unpermissioned', () => {
    const undecided = handlerNames().filter(
      (name) =>
        Reflect.getMetadata(
          REQUIRE_PERMISSION_KEY,
          DrugsController.prototype[name as keyof DrugsController],
        ) === undefined,
    );
    expect(undecided).toEqual([]);
  });

  it('covers every route this controller exposes', () => {
    expect(handlerNames().sort()).toEqual(ROUTES.map(([method]) => method).sort());
  });

  it('scopes every route to the clinic in the path', () => {
    // The catalogue is per-clinic. A route that forgot this would read another clinic's medicines.
    for (const name of handlerNames()) {
      const handler = DrugsController.prototype[name as keyof DrugsController];
      expect([name, Reflect.getMetadata(CLINIC_SCOPED_KEY, handler)]).toEqual([name, true]);
      expect([name, Reflect.getMetadata(CLINIC_ID_SOURCE_KEY, handler)]).toEqual([
        name,
        { type: 'param', paramKey: 'clinicId' },
      ]);
    }
  });

  it('runs authentication, clinic scope and RBAC on the controller', () => {
    expect(Reflect.getMetadata('__guards__', DrugsController)).toEqual([
      JwtAuthGuard,
      ClinicScopeGuard,
      RbacGuard,
    ]);
  });

  it('lets every clinical role read the catalogue', () => {
    for (const role of [
      UserRole.SYSTEM_ADMIN,
      UserRole.DIRECTOR,
      UserRole.MANAGER,
      UserRole.DOCTOR,
      UserRole.VOLUNTEER,
    ]) {
      expect([role, roleHolds(role, PERMISSIONS.DRUG_READ)]).toEqual([role, true]);
    }
  });

  /*
    A doctor prescribes from the catalogue without being able to edit it.

    That separation is the point of having two permissions, and it is the one most likely to be
    lost by someone adding DRUG.MANAGE to the doctor row while fixing something else.
  */
  it('keeps editing the catalogue away from the roles that only use it', () => {
    expect(roleHolds(UserRole.DOCTOR, PERMISSIONS.DRUG_MANAGE)).toBe(false);
    expect(roleHolds(UserRole.VOLUNTEER, PERMISSIONS.DRUG_MANAGE)).toBe(false);
  });

  it('grants catalogue management to the administrative roles', () => {
    const managers = Object.values(UserRole).filter((role) =>
      roleHolds(role, PERMISSIONS.DRUG_MANAGE),
    );
    expect(managers.sort()).toEqual(
      [UserRole.SYSTEM_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER].sort(),
    );
  });

  it('keeps a patient out of the catalogue', () => {
    expect(roleHolds(UserRole.PATIENT, PERMISSIONS.DRUG_READ)).toBe(false);
    expect(roleHolds(UserRole.PATIENT, PERMISSIONS.DRUG_MANAGE)).toBe(false);
  });

  it('does not let a reader manage by reusing one permission for both', () => {
    expect(PERMISSIONS.DRUG_READ).not.toBe(PERMISSIONS.DRUG_MANAGE);
  });
});
