import { AuditService } from './audit.service';
import { runWithOfflineSession } from '../common/request-context.store';

describe('AuditService offline session metadata (#207)', () => {
  const create = jest.fn().mockResolvedValue({});
  const service = new AuditService({ auditEvent: { create } } as never);
  const params = {
    clinicId: 'clinic-1',
    actorUserId: 'user-1',
    action: 'VITALS.CREATE',
    entityType: 'Vitals',
    entityId: 'vitals-1',
    requestId: 'req-1',
  };

  beforeEach(() => create.mockClear());

  it('records the grant, device and unlock method of a write replayed from an offline session', async () => {
    const stamp = { grantId: 'grant-1', deviceId: 'device-1', unlockMethod: 'webauthn' as const };
    await runWithOfflineSession({ ...stamp, extra: 'dropped' } as never, () =>
      service.logWrite(params),
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ offlineSession: stamp }),
    });
  });

  it('records nothing for a write made online', async () => {
    await service.logWrite(params);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('offlineSession');
  });
});
