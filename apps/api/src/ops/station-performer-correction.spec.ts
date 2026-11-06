import { StationService } from './station.service';

/** A corrected performer stays visible beside its replacement (#307, B2). */
describe('StationService performer corrections on the timeline', () => {
  const visit = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    clinicId: 'clinic-1',
    patientCheckInId: 'checkin-1',
    encounterId: 'enc-1',
    status: 'COMPLETED',
    queuedAt: new Date('2026-10-07T09:00:00Z'),
    claimedAt: null,
    completedAt: new Date('2026-10-07T09:10:00Z'),
    performedByIsAccountHolder: false,
    performedByName: 'Kwame Asante',
    handoffNote: null,
    endReason: null,
    releaseCount: 0,
    station: { id: 'st-bp', kind: 'BLOOD_PRESSURE', name: 'BP', sortOrder: 2 },
    claimedBy: null,
    assignedBy: null,
    completedBy: { id: 'vol-1', displayName: 'Ama Volunteer' },
    patientCheckIn: {
      id: 'checkin-1',
      status: 'IN_PROGRESS',
      checkedInAt: new Date('2026-10-07T08:55:00Z'),
      encounterId: 'enc-1',
      patient: { id: 'p-1', patientCode: 'NKP-1', firstName: 'A', lastName: 'B', dob: null },
    },
    ...overrides,
  });

  function setup(events: unknown[]) {
    const prisma = {
      patientCheckIn: { findUnique: jest.fn().mockResolvedValue({ clinicId: 'clinic-1' }) },
      patientStationVisit: {
        findMany: jest.fn().mockResolvedValue([visit('visit-1'), visit('visit-2')]),
      },
      auditEvent: { findMany: jest.fn().mockResolvedValue(events) },
    };
    return { prisma, service: new StationService(prisma as never, {} as never) };
  }

  it('returns the previous performer, who corrected it, when and why', async () => {
    const { prisma, service } = setup([
      {
        entityId: 'visit-1',
        createdAt: new Date('2026-10-07T11:00:00Z'),
        beforeJson: JSON.stringify({
          performedByIsAccountHolder: false,
          performedByName: 'Esi Owusu',
        }),
        afterJson: JSON.stringify({ performedByName: 'Kwame Asante', reason: 'Wrong name picked' }),
        actor: { id: 'mgr-1', displayName: 'Yaw Manager' },
      },
      {
        // An older correction of the same stop: only the latest is shown.
        entityId: 'visit-1',
        createdAt: new Date('2026-10-07T10:00:00Z'),
        beforeJson: JSON.stringify({ performedByIsAccountHolder: true, performedByName: null }),
        afterJson: '{}',
        actor: { id: 'vol-1', displayName: 'Ama Volunteer' },
      },
    ]);

    const { items } = await service.getTimeline('clinic-1', 'checkin-1');

    expect(items[0].performerCorrection).toEqual({
      previousPerformer: 'Esi Owusu',
      correctedAt: '2026-10-07T11:00:00.000Z',
      correctedBy: { id: 'mgr-1', displayName: 'Yaw Manager' },
      reason: 'Wrong name picked',
    });
    expect(items[1].performerCorrection).toBeNull();
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: 'clinic-1',
          action: 'STATION.PERFORMER.CORRECT',
          entityType: 'PatientStationVisit',
          entityId: { in: ['visit-1', 'visit-2'] },
        },
      }),
    );
  });

  it('names the account when the stop was first put down to the account holder', async () => {
    const { service } = setup([
      {
        entityId: 'visit-2',
        createdAt: new Date('2026-10-07T11:00:00Z'),
        beforeJson: JSON.stringify({ performedByIsAccountHolder: true, performedByName: null }),
        afterJson: 'not json',
        actor: { id: 'vol-1', displayName: 'Ama Volunteer' },
      },
    ]);
    const { items } = await service.getTimeline('clinic-1', 'checkin-1');
    expect(items[1].performerCorrection).toMatchObject({
      previousPerformer: 'Ama Volunteer',
      reason: null,
    });
  });
});
