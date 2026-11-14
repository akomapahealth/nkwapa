import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { STAFF_AGREEMENT } from '@nkwapa/db';
import { RbacGuard } from './rbac.guard';

describe('RbacGuard and the confidentiality agreement (#330)', () => {
  const run = (
    permission: string | undefined,
    role: UserRole,
    staffAgreementVersion: number | null,
  ) => {
    const reflector = { getAllAndOverride: () => permission } as unknown as Reflector;
    const request = {
      user: { user: { id: 'user-1', staffAgreementVersion }, roles: [{ clinicId: 'c1', role }] },
      clinicId: 'c1',
    };
    const context = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return () => new RbacGuard(reflector).canActivate(context);
  };

  it('refuses an unsigned volunteer on a permissioned route, with a code the client can read', () => {
    expect.assertions(1);
    try {
      run('PATIENT.SEARCH', UserRole.VOLUNTEER, null)();
    } catch (error) {
      expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({
        code: 'AGREEMENT_REQUIRED',
      });
    }
  });

  it('admits a volunteer who has signed the current version', () => {
    expect(run('PATIENT.SEARCH', UserRole.VOLUNTEER, STAFF_AGREEMENT.version)()).toBe(true);
  });

  it('does not ask a role outside the list', () => {
    expect(run('PATIENT.SEARCH', UserRole.DOCTOR, null)()).toBe(true);
  });

  it('leaves routes with no permission open, so the account can still sign', () => {
    expect(run(undefined, UserRole.VOLUNTEER, null)()).toBe(true);
  });
});
