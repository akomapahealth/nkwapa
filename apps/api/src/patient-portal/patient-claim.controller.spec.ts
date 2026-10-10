import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RATE_LIMIT_METADATA_KEY } from '../common/rate-limit.decorator';
import { PatientClaimController } from './patient-claim.controller';
import { PatientPortalService } from './patient-portal.service';

/*
  The claim endpoint's shape, which is deliberately unlike every other route in the product.

  A patient claiming a record has no clinic and no roles yet -- that is the entire point of
  claiming. So this controller carries `JwtAuthGuard` and nothing else, and adding the guards
  every neighbouring controller has would lock out every new patient while leaving the rest of
  the suite green. That is a regression a reviewer would read as a consistency fix, which is why
  the absence is asserted here rather than left to be noticed.
*/
describe('PatientClaimController', () => {
  const reflector = new Reflector();

  it('admits an authenticated caller who holds no roles at all', () => {
    const guards = reflector.get(GUARDS_METADATA, PatientClaimController) ?? [];

    expect(guards).toEqual([JwtAuthGuard]);
  });

  it('requires no permission and no clinic scope, because a claimant has neither yet', () => {
    expect(reflector.get('requirePermission', PatientClaimController)).toBeUndefined();
    expect(reflector.get('requirePermission', PatientClaimController.prototype.claimRecord)).toBe(
      undefined,
    );
    expect(reflector.get('clinicScope', PatientClaimController.prototype.claimRecord)).toBe(
      undefined,
    );
  });

  /*
    The claim form is an unauthenticated-adjacent guessing surface: a patient code and a date of
    birth. Without a limit an account can walk the code space at whatever rate the network
    allows, and `user-or-ip` is what stops a fresh sign-up per attempt from resetting the count.
  */
  it('rate limits attempts per account or address', () => {
    const config = reflector.get(
      RATE_LIMIT_METADATA_KEY,
      PatientClaimController.prototype.claimRecord,
    );

    expect(config).toEqual({
      key: 'claim_record',
      limit: 10,
      windowSeconds: 600,
      scope: 'user-or-ip',
    });
  });

  it('passes the signed-in account, the body, and the request id straight through', async () => {
    const claimPatientRecord = jest.fn().mockResolvedValue({ success: true });
    const controller = new PatientClaimController({
      claimPatientRecord,
    } as unknown as PatientPortalService);
    const dto = { inviteId: 'invite-1', patientCode: 'NKP-2026-000001', dob: '1998-07-22' };

    await controller.claimRecord(dto, {
      user: { user: { id: 'user-1' } },
      headers: { 'x-request-id': 'req-42' },
    });

    expect(claimPatientRecord).toHaveBeenCalledWith('user-1', dto, 'req-42');
  });

  // Every refusal is audited against a request id, so a claim arriving without a correlation
  // header still has to be traceable.
  it('invents a request id when the caller sent none', async () => {
    const claimPatientRecord = jest.fn().mockResolvedValue({ success: true });
    const controller = new PatientClaimController({
      claimPatientRecord,
    } as unknown as PatientPortalService);

    await controller.claimRecord(
      { inviteId: 'invite-1', patientCode: 'NKP-2026-000001', dob: '1998-07-22' },
      { user: { user: { id: 'user-1' } } },
    );

    const requestId = claimPatientRecord.mock.calls[0][2];
    expect(typeof requestId).toBe('string');
    expect(requestId).toHaveLength(36);
  });
});
