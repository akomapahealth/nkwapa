import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FollowUpMetricsController } from './follow-up-metrics.controller';
import type { FollowUpMetricsService } from './follow-up-metrics.service';
import type { FollowUpRiskService } from './follow-up-risk.service';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const asRole = (role: string) => ({
  user: { user: { id: 'u1' }, roles: [{ role, clinicId: CLINIC }] },
});

function controller(enabled: boolean) {
  const metrics = {
    resolveMonth: jest.fn(() => '2026-10'),
    clinicScope: jest.fn(async (id: string) => ({ clinicIds: [id], timeZone: 'Africa/Accra' })),
    report: jest.fn(async () => ({ register: 0 })),
    patients: jest.fn(async () => ({ total: 0, patients: [] })),
  };
  return {
    metrics,
    controller: new FollowUpMetricsController(
      { enabled } as FollowUpRiskService,
      metrics as unknown as FollowUpMetricsService,
    ),
  };
}

describe('FollowUpMetricsController (#339)', () => {
  it('is not found while the flag is off', () => {
    const { controller: c } = controller(false);
    expect(() => c.report({ clinicId: CLINIC }, {})).toThrow(NotFoundException);
    expect(() =>
      c.patients({ clinicId: CLINIC }, { figure: 'controlled' }, asRole('DIRECTOR') as never),
    ).toThrow(NotFoundException);
  });

  it('never lists names to a role without PATIENT.READ at the clinic', () => {
    const { controller: c, metrics } = controller(true);
    // A seat elsewhere does not count here.
    const elsewhere = {
      user: { user: { id: 'u1' }, roles: [{ role: 'DIRECTOR', clinicId: 'other' }] },
    };
    expect(() =>
      c.patients({ clinicId: CLINIC }, { figure: 'controlled' }, elsewhere as never),
    ).toThrow(ForbiddenException);
    expect(() =>
      c.patients({ clinicId: CLINIC }, { figure: 'controlled' }, asRole('PATIENT') as never),
    ).toThrow(ForbiddenException);
    expect(metrics.patients).not.toHaveBeenCalled();
  });

  it('lists names to a director at the clinic', async () => {
    const { controller: c, metrics } = controller(true);
    await c.patients({ clinicId: CLINIC }, { figure: 'controlled' }, asRole('DIRECTOR') as never);
    expect(metrics.patients).toHaveBeenCalledWith(
      { clinicIds: [CLINIC], timeZone: 'Africa/Accra' },
      '2026-10',
      'controlled',
      expect.any(Date),
    );
  });
});
