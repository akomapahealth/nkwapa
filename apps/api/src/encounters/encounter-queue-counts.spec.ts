import { EncounterRepository } from './encounter.repository';
import { EncounterService } from './encounter.service';

/** True queue totals, so a lane tab never stops at 50 (#307, B3). */
describe('encounter queue lane counts', () => {
  function setup(counts: number[]) {
    const prisma = {
      encounter: {
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    for (const value of counts) prisma.encounter.count.mockResolvedValueOnce(value);
    const repository = new EncounterRepository(prisma as never);
    const service = new EncounterService(repository, {} as never, {} as never, {} as never);
    return { prisma, repository, service };
  }

  it('counts each lane with the filter its list uses, uncapped', async () => {
    const { prisma, service } = setup([538, 12, 3]);
    await expect(service.countQueueLanes('clinic-1')).resolves.toEqual({
      drafts: 538,
      review: 12,
      finalize: 3,
    });
    expect(prisma.encounter.count.mock.calls.map(([args]) => args.where)).toEqual([
      { clinicId: 'clinic-1', status: 'DRAFT' },
      { clinicId: 'clinic-1', status: 'IN_REVIEW', preceptorReviewedById: null },
      {
        clinicId: 'clinic-1',
        status: 'IN_REVIEW',
        preceptorReviewedById: { not: null },
        doctorFinalizedById: null,
      },
    ]);
  });

  it('pages a lane with skip', async () => {
    const { prisma, repository } = setup([]);
    await repository.findManyByClinic('clinic-1', { status: 'DRAFT', take: 50, skip: 50 });
    expect(prisma.encounter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clinicId: 'clinic-1', status: 'DRAFT' },
        skip: 50,
        take: 50,
      }),
    );
  });
});
