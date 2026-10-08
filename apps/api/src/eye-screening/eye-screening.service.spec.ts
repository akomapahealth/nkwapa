import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EyeScreeningService } from './eye-screening.service';

const base = {
  hasEyeComplaint: true,
  complaintHistory: 'Blurred distance vision for a year',
  wearsCorrection: false,
  vaOdUnaided: '6/18',
  vaOsUnaided: '6/12',
  vaOdPinhole: '6/9',
  cupDiscRatioOd: 0.3,
  findings: [
    { eye: 'OD', structure: 'LENS', result: 'NORMAL' },
    { eye: 'OS', structure: 'MACULA', result: 'ABNORMAL', note: ' Exudates ' },
  ],
  visionLossCause: 'REFRACTIVE',
  diabeticSignsSeen: false,
  hypertensiveSignsSeen: false,
  referralRecommended: true,
  referralNote: 'Refraction at the eye clinic',
};

function setup(existing: Record<string, unknown> | null = null, status = 'DRAFT') {
  let saved: Record<string, unknown> = {};
  let findings: Array<Record<string, unknown>> = [];
  const tx = {
    encounter: {
      findUnique: jest.fn().mockResolvedValue({ id: 'enc-1', clinicId: 'clinic-1', status }),
    },
    eyeScreening: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(({ data }) => {
        saved = { id: 'eye-1', version: 1, ...data };
        return Promise.resolve(saved);
      }),
      update: jest.fn().mockImplementation(({ data }) => {
        saved = { ...existing, ...data, version: (existing?.version as number) + 1 };
        return Promise.resolve(saved);
      }),
      findUniqueOrThrow: jest.fn().mockImplementation(() =>
        Promise.resolve({
          ...saved,
          cupDiscRatioOd:
            saved.cupDiscRatioOd == null
              ? null
              : new Prisma.Decimal(saved.cupDiscRatioOd as number),
          cupDiscRatioOs: null,
          author: { id: 'vol-1', displayName: 'Volunteer One' },
          findings,
          updatedAt: new Date('2026-10-08T10:00:00Z'),
        }),
      ),
    },
    eyeExamFinding: {
      deleteMany: jest.fn().mockImplementation(() => {
        findings = [];
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn().mockImplementation(({ data }) => {
        findings = data;
        return Promise.resolve({ count: data.length });
      }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
  return { service: new EyeScreeningService(prisma as never, audit as never), tx, audit };
}

describe('EyeScreeningService', () => {
  it('creates the record with its findings and audits without the content', async () => {
    const { service, tx, audit } = setup();
    const { record } = await service.upsert('clinic-1', 'enc-1', 'vol-1', base as never, 'req-1');

    expect(tx.eyeScreening.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clinicId: 'clinic-1',
        encounterId: 'enc-1',
        authorUserId: 'vol-1',
        vaOdUnaided: '6/18',
        vaOuUnaided: null,
      }),
    });
    expect(record.findings).toEqual([
      { eye: 'OD', structure: 'LENS', result: 'NORMAL', note: null },
      { eye: 'OS', structure: 'MACULA', result: 'ABNORMAL', note: 'Exudates' },
    ]);
    expect(record.cupDiscRatioOd).toBe(0.3);

    const [event, client] = audit.logWrite.mock.calls[0];
    expect(client).toBe(tx);
    expect(event).toMatchObject({ action: 'EYE_SCREENING.CREATE', requestId: 'req-1' });
    expect(event.afterJson).not.toContain('Exudates');
    expect(event.afterJson).not.toContain('Blurred');
  });

  it('replaces the findings on every save', async () => {
    const { service, tx } = setup({ id: 'eye-1', version: 2 });
    const { record } = await service.upsert('clinic-1', 'enc-1', 'doc-1', {
      ...base,
      expectedVersion: 2,
      findings: [{ eye: 'OD', structure: 'PUPIL', result: 'NOT_ASSESSED' }],
    } as never);

    expect(tx.eyeExamFinding.deleteMany).toHaveBeenCalledWith({
      where: { eyeScreeningId: 'eye-1' },
    });
    expect(record.findings).toHaveLength(1);
    expect(record.version).toBe(3);
  });

  it('refuses a stale edit', async () => {
    const { service } = setup({ id: 'eye-1', version: 3 });
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-1', { ...base, expectedVersion: 2 } as never),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT', currentVersion: 3 } });
  });

  it('refuses a finalized encounter', async () => {
    const { service } = setup(null, 'FINALIZED');
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-1', base as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an encounter from another clinic', async () => {
    const { service } = setup();
    await expect(
      service.upsert('clinic-2', 'enc-1', 'vol-1', base as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses the same structure twice for one eye', async () => {
    const { service, tx } = setup();
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-1', {
        ...base,
        findings: [
          { eye: 'OS', structure: 'CORNEA', result: 'NORMAL' },
          { eye: 'OS', structure: 'CORNEA', result: 'ABNORMAL' },
        ],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.eyeScreening.create).not.toHaveBeenCalled();
  });

  it('refuses detail without its choice', async () => {
    const { service } = setup();
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-1', { ...base, hasEyeComplaint: false } as never),
    ).rejects.toMatchObject({ response: { fieldErrors: [{ field: 'complaintHistory' }] } });
    await expect(
      service.upsert('clinic-1', 'enc-1', 'vol-1', {
        ...base,
        referralRecommended: false,
      } as never),
    ).rejects.toMatchObject({ response: { fieldErrors: [{ field: 'referralNote' }] } });
  });
});
