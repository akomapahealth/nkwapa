import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AdminController } from '../admin/admin.controller';
import { PERMISSIONS } from '../auth/constants/permissions';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { TRACK_TELEMETRY_KEY } from '../telemetry/track.decorator';
import { crossClinicInvestigationShape } from '../telemetry/track-descriptors';

const CLINIC_A = '11111111-1111-4111-8111-111111111111';

/**
 * `GET /admin/patients/duplicates/cross-clinic`, at the layers a request meets before the service.
 *
 * The suite has no HTTP layer, so the guard is driven directly with the route's real metadata.
 * That is what proves a doctor or volunteer is turned away before any identity data is read; the
 * service-level refusal of directors and managers is proved in `patient-duplicate.service.spec.ts`.
 */
describe('cross-clinic duplicate investigation route', () => {
  const reflector = new Reflector();
  const guard = new RbacGuard(reflector);
  const handler = AdminController.prototype.investigateCrossClinicDuplicates;

  function contextFor(roles: ReqUserWithRoles['roles']): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => AdminController,
      switchToHttp: () => ({ getRequest: () => ({ user: { user: { id: 'u-1' }, roles } }) }),
    } as unknown as ExecutionContext;
  }

  it('requires duplicate review rather than the class-level clinic management', () => {
    expect(reflector.get<string>('requirePermission', handler)).toBe(
      PERMISSIONS.PATIENT_DUPLICATE_REVIEW,
    );
  });

  it('records a telemetry event', () => {
    expect(reflector.get(TRACK_TELEMETRY_KEY, handler)).toMatchObject({
      event: 'patient.duplicate.investigate',
    });
  });

  it('lets a system admin through the guard', () => {
    expect(guard.canActivate(contextFor([{ clinicId: null, role: UserRole.SYSTEM_ADMIN }]))).toBe(
      true,
    );
  });

  it.each([UserRole.DOCTOR, UserRole.VOLUNTEER])(
    'turns a %s away at the guard, before anything is read',
    (role) => {
      expect(() => guard.canActivate(contextFor([{ clinicId: CLINIC_A, role }]))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('forwards the actor, the filters and the request id to the service', async () => {
    const investigateCrossClinic = jest.fn().mockResolvedValue({ items: [] });
    const controller = new AdminController(
      {} as never,
      { investigateCrossClinic } as never,
      {} as never,
    );
    const roles = [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }];

    await controller.investigateCrossClinicDuplicates({ confidence: 'HIGH' }, {
      user: { user: { id: 'sysadmin-1' }, roles },
      headers: { 'x-request-id': 'req-1' },
    } as never);

    expect(investigateCrossClinic).toHaveBeenCalledWith(
      { userId: 'sysadmin-1', roles },
      { confidence: 'HIGH' },
      'req-1',
    );
  });

  it('describes the result as counts only', () => {
    expect(
      crossClinicInvestigationShape({
        truncated: false,
        burden: { totalPairs: 3, clinicPairs: [{}, {}] },
        items: [{ patients: [{ firstName: 'Ama' }] }],
      }),
    ).toEqual({ pairCount: 3, clinicPairCount: 2, truncated: false });
    expect(crossClinicInvestigationShape(undefined)).toEqual({
      pairCount: 0,
      clinicPairCount: 0,
      truncated: false,
    });
  });
});
