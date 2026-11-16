import { ExecutionContext, ForbiddenException, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { STAFF_AGREEMENT } from '@nkwapa/db';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { RedisService } from '../redis/redis.service';
import { ReferralReportController } from './referral-report.controller';
import { ReferralReportService } from './referral-report.service';

const CLINIC = 'clinic-1';

const userWith = (id: string, roles: Array<{ clinicId: string | null; role: UserRole }>) => ({
  user: { id, staffAgreementVersion: STAFF_AGREEMENT.version },
  roles,
});
const inClinic = (role: UserRole, clinicId = CLINIC) => userWith(`${role}-1`, [{ clinicId, role }]);

describe('ReferralReportController (#344)', () => {
  let controller: ReferralReportController;
  let clinicScope: ClinicScopeGuard;
  let rbac: RbacGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReferralReportController],
      providers: [
        Reflector,
        ClinicScopeGuard,
        RbacGuard,
        { provide: ReferralReportService, useValue: {} },
        { provide: RedisService, useValue: { isReady: () => false } },
      ],
    }).compile();
    controller = module.get(ReferralReportController);
    clinicScope = module.get(ClinicScopeGuard);
    rbac = module.get(RbacGuard);
  });

  const context = (user: ReturnType<typeof userWith>, handler: 'create' | 'sections') =>
    ({
      getHandler: () => controller[handler],
      getClass: () => ReferralReportController,
      switchToHttp: () => ({
        getRequest: () => ({
          params: { clinicId: CLINIC, patientId: 'patient-1' },
          headers: {},
          method: 'POST',
          user,
        }),
      }),
    }) as unknown as ExecutionContext;

  it.each([UserRole.DOCTOR, UserRole.VOLUNTEER, UserRole.MANAGER])('lets a %s export', (role) => {
    const ctx = context(inClinic(role), 'create');
    expect(clinicScope.canActivate(ctx)).toBe(true);
    expect(rbac.canActivate(ctx)).toBe(true);
  });

  it.each([UserRole.DIRECTOR, UserRole.PATIENT])('refuses a %s', (role) => {
    const ctx = context(inClinic(role), 'create');
    clinicScope.canActivate(ctx);
    expect(() => rbac.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('refuses a doctor at another clinic', () => {
    const ctx = context(inClinic(UserRole.DOCTOR, 'other-clinic'), 'create');
    expect(() => clinicScope.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rate limits per user after the JWT guard has put the user on the request', async () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller.create) as unknown[];
    expect(guards).toContain(RateLimitGuard);

    let count = 0;
    const redis = {
      isReady: () => true,
      client: { incr: async () => ++count, expire: async () => 1 },
    } as unknown as RedisService;
    const guard = new RateLimitGuard(new Reflector(), redis);
    const ctx = context(inClinic(UserRole.DOCTOR), 'create');
    for (let i = 0; i < 10; i++) expect(await guard.canActivate(ctx)).toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });
});
