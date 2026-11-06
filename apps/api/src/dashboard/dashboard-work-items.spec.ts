import { DashboardService, DASHBOARD_WORK_ITEM_LIMIT } from './dashboard.service';

/** Named "Needs you now" rows (#307, B5): who is waiting, and at which station. */
describe('DashboardService work items', () => {
  function setup() {
    const prisma = {
      encounter: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'enc-1',
            patient: { patientCode: 'NKP-2026-000001', firstName: 'Ama', lastName: 'Mensah' },
          },
          {
            id: 'enc-2',
            patient: { patientCode: 'NKP-2026-000002', firstName: 'Kofi', lastName: 'Boateng' },
          },
        ]),
      },
      patientStationVisit: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ encounterId: 'enc-2', station: { name: 'Blood pressure' } }]),
      },
      clinicalNote: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new DashboardService(prisma as never);
    jest.spyOn(service as never, 'getSummary' as never).mockResolvedValue({} as never);
    jest
      .spyOn(service as never, 'getClinicalMeasurementMetrics' as never)
      .mockResolvedValue({} as never);
    jest
      .spyOn(service as never, 'getVolunteerMetrics' as never)
      .mockResolvedValue({ pendingSubmissions: 2 } as never);
    jest
      .spyOn(service as never, 'getDoctorMetrics' as never)
      .mockResolvedValue({ awaitingFinalization: 2 } as never);
    jest.spyOn(service as never, 'getReviewMetrics' as never).mockResolvedValue({} as never);
    return { prisma, service };
  }

  it("names a volunteer's draft visits, with the station each patient is at", async () => {
    const { prisma, service } = setup();
    const response = await service.getDashboard('clinic-1', ['VOLUNTEER'], 'vol-1');

    expect(response.volunteer?.pendingSubmissionItems).toEqual([
      {
        encounterId: 'enc-1',
        patientCode: 'NKP-2026-000001',
        patientName: 'Ama Mensah',
        station: null,
      },
      {
        encounterId: 'enc-2',
        patientCode: 'NKP-2026-000002',
        patientName: 'Kofi Boateng',
        station: 'Blood pressure',
      },
    ]);
    // The same filter as the count beside it, in this clinic only, a few rows at most.
    expect(prisma.encounter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdByUserId: 'vol-1', status: 'DRAFT', clinicId: 'clinic-1' },
        take: DASHBOARD_WORK_ITEM_LIMIT,
      }),
    );
    expect(prisma.patientStationVisit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: 'clinic-1',
          status: { in: ['QUEUED', 'IN_PROGRESS'] },
        }),
      }),
    );
  });

  it("names a doctor's visits waiting for sign-off", async () => {
    const { prisma, service } = setup();
    const response = await service.getDashboard('clinic-1', ['DOCTOR'], 'doc-1');

    expect(response.doctor?.awaitingFinalizationItems).toHaveLength(2);
    expect(prisma.encounter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'IN_REVIEW',
          preceptorReviewedById: { not: null },
          doctorFinalizedById: null,
          clinicId: 'clinic-1',
        },
      }),
    );
  });

  it('names nobody for a role without the patient list', async () => {
    const { prisma, service } = setup();
    const response = await service.getDashboard('clinic-1', ['PATIENT'], 'user-1');
    expect(response.volunteer).toBeUndefined();
    expect(response.doctor).toBeUndefined();
    expect(prisma.encounter.findMany).not.toHaveBeenCalled();
  });
});
