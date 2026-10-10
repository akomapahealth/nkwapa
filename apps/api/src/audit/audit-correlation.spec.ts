import { AuditService } from './audit.service';
import { runWithRequestContext } from '../common/request-context.store';
import type { PrismaService } from '../prisma/prisma.service';

describe('audit event correlation', () => {
  const create = jest.fn().mockResolvedValue({});
  const service = new AuditService({ auditEvent: { create } } as unknown as PrismaService);

  const written = () => create.mock.calls.at(-1)?.[0].data;

  const event = {
    clinicId: 'clinic-1',
    actorUserId: 'user-1',
    action: 'PATIENT.UPDATE',
    entityType: 'Patient',
    entityId: 'patient-1',
  };

  beforeEach(() => create.mockClear());

  it('takes the request identity from the ambient context', async () => {
    // Threading these down by hand meant the sites that forgot invented a fresh id, which reads
    // like a correlation and is not one: the writes of a single request could not be tied
    // together and the caller was unknown.
    await runWithRequestContext(
      { requestId: 'req-42', ipAddress: '203.0.113.9', userAgent: 'Nkwapa/1.0' },
      () => service.logWrite(event),
    );

    expect(written()).toMatchObject({
      requestId: 'req-42',
      ipAddress: '203.0.113.9',
      userAgent: 'Nkwapa/1.0',
    });
  });

  it('correlates every write a single request performs', async () => {
    await runWithRequestContext(
      { requestId: 'req-99', ipAddress: null, userAgent: null },
      async () => {
        await service.logWrite(event);
        await service.logWrite({ ...event, action: 'ENCOUNTER.CREATE' });
      },
    );

    const ids = create.mock.calls.map((call) => call[0].data.requestId);
    expect(ids).toEqual(['req-99', 'req-99']);
  });

  it('lets an explicit value win, so sync can correlate by idempotency key', async () => {
    await runWithRequestContext(
      { requestId: 'req-1', ipAddress: '203.0.113.9', userAgent: 'Nkwapa/1.0' },
      () => service.logWrite({ ...event, requestId: 'idempotency-key-7' }),
    );

    expect(written().requestId).toBe('idempotency-key-7');
    // The ambient address still applies: only the id was overridden.
    expect(written().ipAddress).toBe('203.0.113.9');
  });

  it('still writes an event outside any request, such as a background job', async () => {
    await service.logWrite(event);

    expect(written().requestId).toEqual(expect.any(String));
    expect(written().ipAddress).toBeUndefined();
  });
});
