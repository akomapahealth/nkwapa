import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { MERGE_RELATIONS } from '@nkwapa/db';
import {
  PatientMergeService,
  buildMergedPatientCode,
  type MergeActor,
} from './patient-merge.service';
import {
  FIXTURE_CLINIC as CLINIC,
  type IdentityPrismaMock as PrismaMock,
  canonicalChartFixture as canonicalChart,
  createIdentityPrismaMock,
  identityChartFixture as chart,
  sourceChartFixture as sourceChart,
} from '../testing/patient-identity-fixtures';

const systemAdmin: MergeActor = {
  userId: 'sysadmin-1',
  roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
};

const director: MergeActor = {
  userId: 'director-1',
  roles: [{ clinicId: 'clinic-1', role: UserRole.DIRECTOR }],
};

function createService(options: { relationCounts?: Record<string, [number, number]> } = {}) {
  const prisma = createIdentityPrismaMock(options);
  const auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };

  return {
    prisma,
    auditService,
    service: new PatientMergeService(prisma as never, auditService as never),
  };
}

/** Point `patient.findUnique` at the two charts, for both the evaluation and the in-transaction recheck. */
function stubCharts(prisma: PrismaMock, canonical = canonicalChart(), source = sourceChart()) {
  prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
    args.where.id === canonical.id ? canonical : source,
  );
  return { canonical, source };
}

async function findingCodes(promise: Promise<{ findings: { code: string }[] }>) {
  return (await promise).findings.map((finding) => finding.code);
}

describe('the relation keys the merge loop indexes by', () => {
  /*
    MERGE_RELATIONS lives in @nkwapa/db, which cannot import the generated Prisma client, so its
    keys are plain strings and the loop reaches the delegates through a cast. A typo there would
    not fail to compile -- it would throw at runtime, part-way through an irreversible merge.
    Prisma.ModelName is generated, so checking against it costs nothing and closes that gap.
  */
  const modelNames = new Set<string>(Object.values(Prisma.ModelName));

  it.each(MERGE_RELATIONS.map((relation) => relation.key))(
    '%s names a real Prisma model',
    (key) => {
      expect(modelNames).toContain(key.charAt(0).toUpperCase() + key.slice(1));
    },
  );

  it('covers the models the merge reaches for by hand as well', () => {
    for (const model of [
      'PatientMergeRecord',
      'PatientDuplicateReview',
      'PatientCodeAlias',
      'PatientAccountLink',
      'PatientPortalInvite',
    ]) {
      expect(modelNames).toContain(model);
    }
  });
});

describe('PatientMergeService.evaluate', () => {
  it('refuses anyone who is not a system administrator', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    await expect(service.evaluate(director, 'patient-1', 'patient-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // The refusal must not have read a chart on the way to being refused.
    expect(prisma.patient.findUnique).not.toHaveBeenCalled();
  });

  it('treats a clinic-scoped SYSTEM_ADMIN grant as not holding the global seat', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    await expect(
      service.evaluate(
        { userId: 'u', roles: [{ clinicId: 'clinic-1', role: UserRole.SYSTEM_ADMIN }] },
        'patient-1',
        'patient-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses one chart against itself', async () => {
    const { service } = createService();
    await expect(service.evaluate(systemAdmin, 'patient-1', 'patient-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reports a missing chart as not found', async () => {
    const { service, prisma } = createService();
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.evaluate(systemAdmin, 'patient-1', 'patient-2')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('writes nothing at all while evaluating', async () => {
    const { service, prisma, auditService } = createService();
    stubCharts(prisma);
    await service.evaluate(systemAdmin, 'patient-1', 'patient-2');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.patient.update).not.toHaveBeenCalled();
    expect(prisma.patientCodeAlias.upsert).not.toHaveBeenCalled();
    expect(prisma.patientMergeRecord.create).not.toHaveBeenCalled();
    expect(auditService.logWrite).not.toHaveBeenCalled();
  });

  it('counts every relation the merge moves, on both sides', async () => {
    const { service, prisma } = createService({
      relationCounts: { encounter: [4, 2], clinicalNote: [1, 3] },
    });
    stubCharts(prisma);

    const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');

    expect(preview.relations).toHaveLength(MERGE_RELATIONS.length);
    expect(preview.relations.find((row) => row.key === 'encounter')).toMatchObject({
      label: 'Visits',
      canonicalCount: 4,
      sourceCount: 2,
    });
    // The relation the original merge left behind.
    expect(preview.relations.find((row) => row.key === 'clinicalNote')).toMatchObject({
      canonicalCount: 1,
      sourceCount: 3,
    });
  });

  it('names the code the retired chart gives up and the one it is renamed to', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');

    expect(preview.aliases.added).toBe('NKP-2026-000099');
    expect(preview.tombstonePatientCode).toBe('NKP-2026-000099-M-PATIENT2');
    expect(preview.tombstonePatientCode.length).toBeLessThanOrEqual(32);
  });

  it('clears a healthy pair with nothing to report', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');

    expect(preview.findings).toEqual([]);
    expect(preview.canMerge).toBe(true);
    expect(preview.duplicateSignal.confidence).toBe('HIGH');
  });

  describe('blocked conditions', () => {
    it('blocks a chart that has already been merged away', async () => {
      const { service, prisma } = createService();
      stubCharts(prisma, canonicalChart(), sourceChart());
      prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
        args.where.id === 'patient-1'
          ? canonicalChart()
          : chart({ ...sourceChart(), mergedIntoPatientId: 'patient-9' }),
      );

      const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      expect(preview.findings.map((f) => f.code)).toContain('SOURCE_ALREADY_MERGED');
      expect(preview.canMerge).toBe(false);
    });

    it('blocks a surviving chart that is itself a tombstone', async () => {
      const { service, prisma } = createService();
      prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
        args.where.id === 'patient-1' ? chart({ mergedIntoPatientId: 'patient-9' }) : sourceChart(),
      );

      expect(await findingCodes(service.evaluate(systemAdmin, 'patient-1', 'patient-2'))).toContain(
        'CANONICAL_ALREADY_MERGED',
      );
    });

    it('blocks two charts in different clinics, and names both', async () => {
      const { service, prisma } = createService();
      prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
        args.where.id === 'patient-1'
          ? canonicalChart()
          : chart({
              ...sourceChart(),
              primaryClinicId: 'clinic-2',
              primaryClinic: { ...CLINIC, id: 'clinic-2', name: 'Clinic Two' },
            }),
      );

      const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      const crossClinic = preview.findings.find((f) => f.code === 'CROSS_CLINIC');
      expect(crossClinic?.severity).toBe('BLOCK');
      expect(crossClinic?.detail).toBe('Clinic One and Clinic Two');
      expect(preview.canMerge).toBe(false);
    });

    it('blocks a merge inside a deactivated clinic', async () => {
      const inactive = { ...CLINIC, isActive: false };
      const { service, prisma } = createService();
      prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
        args.where.id === 'patient-1'
          ? chart({ primaryClinic: inactive })
          : chart({ ...sourceChart(), primaryClinic: inactive }),
      );

      expect(await findingCodes(service.evaluate(systemAdmin, 'patient-1', 'patient-2'))).toContain(
        'CLINIC_INACTIVE',
      );
    });

    it('blocks when the retiring code already belongs to a third chart', async () => {
      const { service, prisma } = createService();
      stubCharts(prisma);
      prisma.patientCodeAlias.findMany.mockResolvedValue([{ code: 'NKP-2026-000099' }]);

      const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      const finding = preview.findings.find((f) => f.code === 'ALIAS_CODE_COLLISION');
      expect(finding?.detail).toBe('NKP-2026-000099');
      expect(preview.canMerge).toBe(false);
    });

    it('blocks when both charts have an open preferred pharmacy', async () => {
      const { service, prisma } = createService();
      stubCharts(prisma);
      // A partial unique index allows one open period per patient, so moving the second would
      // roll the whole transaction back on a constraint nobody can read.
      prisma.patientPharmacyPreference.count = jest.fn(
        async (args: { where: { effectiveTo?: null } }) =>
          args.where.effectiveTo === null ? 1 : 0,
      );

      expect(await findingCodes(service.evaluate(systemAdmin, 'patient-1', 'patient-2'))).toContain(
        'OPEN_PHARMACY_PREFERENCE_CONFLICT',
      );
    });

    it('blocks two different app accounts until the operator picks one', async () => {
      const { service, prisma } = createService();
      stubCharts(prisma);
      prisma.patientAccountLink.findUnique.mockImplementation(
        async (args: { where: { patientId: string } }) => ({
          id: `link-${args.where.patientId}`,
          patientId: args.where.patientId,
          keycloakSub: args.where.patientId === 'patient-1' ? 'kc-a' : 'kc-b',
        }),
      );

      const blocked = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      expect(blocked.findings.map((f) => f.code)).toContain('PORTAL_LINK_CONFLICT');
      expect(blocked.canMerge).toBe(false);

      // Naming a strategy is the deliberate choice the block is asking for.
      const chosen = await service.evaluate(systemAdmin, 'patient-1', 'patient-2', {
        portalLinkStrategy: 'CANONICAL',
      });
      expect(chosen.findings.map((f) => f.code)).not.toContain('PORTAL_LINK_CONFLICT');
      expect(chosen.findings.map((f) => f.code)).toContain('PORTAL_ACCOUNT_RETIRED');
      expect(chosen.canMerge).toBe(true);
    });

    it('does not treat one account reachable from both charts as a conflict', async () => {
      const { service, prisma } = createService();
      stubCharts(prisma);
      prisma.patientAccountLink.findUnique.mockImplementation(
        async (args: { where: { patientId: string } }) => ({
          id: 'link',
          patientId: args.where.patientId,
          keycloakSub: 'kc-same',
        }),
      );

      const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      expect(preview.findings).toEqual([]);
    });
  });

  describe('warnings', () => {
    it('warns when the two charts do not look much alike', async () => {
      const { service, prisma } = createService();
      prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
        args.where.id === 'patient-1'
          ? chart({ phoneE164: null })
          : chart({
              ...sourceChart(),
              firstName: 'Yaa',
              lastName: 'Mensah',
              dob: new Date('1990-01-01'),
              phoneE164: null,
              nationalIdHash: 'hash-b',
            }),
      );

      const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      expect(preview.findings.map((f) => f.code)).toContain('WEAK_DUPLICATE_SIGNAL');
      // A warning names a consequence; it does not stop the merge.
      expect(preview.canMerge).toBe(true);
    });

    it('warns when the duplicate holds more history than the chart being kept', async () => {
      const { service, prisma } = createService({ relationCounts: { encounter: [1, 9] } });
      stubCharts(prisma);

      const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      const finding = preview.findings.find((f) => f.code === 'SOURCE_HAS_MORE_HISTORY');
      expect(finding?.detail).toBe('9 records against 1');
    });

    it('warns about invitations the chosen strategy cancels', async () => {
      const { service, prisma } = createService();
      stubCharts(prisma);
      prisma.patientPortalInvite.findMany.mockImplementation(
        async (args: { where: { patientId: string } }) =>
          args.where.patientId === 'patient-2'
            ? [{ id: 'invite-1', status: 'PENDING' }]
            : [{ id: 'invite-0', status: 'CLAIMED' }],
      );

      const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2', {
        inviteStrategy: 'CANONICAL',
      });
      expect(preview.portal.invitesCancelled).toBe(1);
      expect(preview.findings.find((f) => f.code === 'PENDING_INVITES_CANCELLED')?.detail).toBe(
        '1 invitation',
      );

      // The default strategy carries the invitation across instead of cancelling it.
      const carried = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      expect(carried.portal.invitesCancelled).toBe(0);
      expect(carried.findings.map((f) => f.code)).not.toContain('PENDING_INVITES_CANCELLED');
    });

    it('warns when someone already ruled the pair out, and quotes their note', async () => {
      const { service, prisma } = createService();
      stubCharts(prisma);
      prisma.patientDuplicateReview.findUnique.mockResolvedValue({
        status: 'DISMISSED',
        note: 'Sisters, not the same person.',
      });

      const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');
      const finding = preview.findings.find(
        (f) => f.code === 'DUPLICATE_PAIR_PREVIOUSLY_DISMISSED',
      );
      expect(finding?.detail).toBe('Sisters, not the same person.');
      expect(preview.canMerge).toBe(true);
    });
  });

  it('changes its fingerprint when a chart changes', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    const before = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');

    prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === 'patient-1'
        ? canonicalChart()
        : chart({ ...sourceChart(), updatedAt: new Date('2026-09-04T10:00:00.000Z') }),
    );
    const after = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');

    expect(after.fingerprint).not.toBe(before.fingerprint);
  });
});

describe('PatientMergeService.preview', () => {
  it('publishes both charts in the shape the duplicate queue already uses', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    const preview = await service.preview(systemAdmin, 'patient-1', 'patient-2');

    // Same field set as DuplicateCandidatePatient, so one comparison table serves both screens.
    for (const side of [preview.canonical, preview.source]) {
      expect(Object.keys(side).sort()).toEqual(
        [
          'clinic',
          'createdAt',
          'dob',
          'email',
          'firstName',
          'id',
          'lastName',
          'nationalIdLast4',
          'nationalIdType',
          'patientCode',
          'phoneE164',
          'portalLinked',
          'sex',
          'updatedAt',
        ].sort(),
      );
      expect(side.clinic).toEqual({
        id: 'clinic-1',
        name: 'Clinic One',
        organizationId: 'org-1',
        organizationName: 'Akomapa',
      });
    }
    expect(preview.canonical.dob).toBe('1988-07-04T00:00:00.000Z');
  });

  it('never carries the national ID itself, only its last four digits', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    const preview = await service.preview(systemAdmin, 'patient-1', 'patient-2');
    const serialized = JSON.stringify(preview);

    expect(serialized).not.toContain('nationalIdCiphertext');
    expect(serialized).not.toContain('hash-a');
    expect(preview.source.nationalIdLast4).toBe('4472');
  });

  it('splits findings into what stops the merge and what merely warns about it', async () => {
    const { service, prisma } = createService({ relationCounts: { encounter: [0, 3] } });
    prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === 'patient-1'
        ? canonicalChart()
        : chart({
            ...sourceChart(),
            primaryClinicId: 'clinic-2',
            primaryClinic: { ...CLINIC, id: 'clinic-2', name: 'Clinic Two' },
          }),
    );

    const preview = await service.preview(systemAdmin, 'patient-1', 'patient-2');

    expect(preview.blockers.map((f) => f.code)).toEqual(['CROSS_CLINIC']);
    expect(preview.warnings.map((f) => f.code)).toContain('SOURCE_HAS_MORE_HISTORY');
    expect(preview.blockers.every((f) => f.severity === 'BLOCK')).toBe(true);
    expect(preview.warnings.every((f) => f.severity === 'WARN')).toBe(true);
    expect(preview.canMerge).toBe(false);
  });

  it('says what each finding means and what to do about it', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    prisma.patientCodeAlias.findMany.mockResolvedValue([{ code: 'NKP-2026-000099' }]);

    const preview = await service.preview(systemAdmin, 'patient-1', 'patient-2');

    const blocker = preview.blockers[0];
    expect(blocker.label).not.toMatch(/^[A-Z_]+$/);
    expect(blocker.recovery.length).toBeGreaterThan(20);
  });

  it('reports the whole relation list, including the ones with nothing to move', async () => {
    const { service, prisma } = createService({ relationCounts: { encounter: [2, 1] } });
    stubCharts(prisma);

    const preview = await service.preview(systemAdmin, 'patient-1', 'patient-2');

    // An empty row is information: it says the duplicate holds no notes, rather than leaving an
    // operator to wonder whether notes were checked at all.
    expect(preview.relations).toHaveLength(MERGE_RELATIONS.length);
    expect(preview.relations.every((row) => typeof row.label === 'string')).toBe(true);
  });

  it('states the strategies it answered under, including the defaults', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    expect((await service.preview(systemAdmin, 'patient-1', 'patient-2')).strategies).toEqual({
      portalLinkStrategy: 'CANONICAL',
      inviteStrategy: 'MERGE',
    });
    expect(
      (
        await service.preview(systemAdmin, 'patient-1', 'patient-2', {
          portalLinkStrategy: 'SOURCE',
        })
      ).strategies.portalLinkStrategy,
    ).toBe('SOURCE');
  });

  it('carries a fingerprint the merge will accept', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    const preview = await service.preview(systemAdmin, 'patient-1', 'patient-2');

    expect(preview.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    await expect(
      service.merge(systemAdmin, 'patient-1', 'patient-2', {
        expectedFingerprint: preview.fingerprint,
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it('does not leak the rows the transaction needs into the payload', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    const preview = await service.preview(systemAdmin, 'patient-1', 'patient-2');

    expect(preview).not.toHaveProperty('portalRows');
    expect(preview).not.toHaveProperty('findings');
  });

  it('is refused to anyone who is not a system administrator', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    await expect(service.preview(director, 'patient-1', 'patient-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PatientMergeService.merge', () => {
  it('moves every relation in the shared list, including the seven that used to be stranded', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    await service.merge(systemAdmin, 'patient-1', 'patient-2', undefined, 'req-1');

    for (const relation of MERGE_RELATIONS) {
      expect(prisma[relation.key].updateMany).toHaveBeenCalledWith({
        where: { patientId: 'patient-2' },
        data: { patientId: 'patient-1' },
      });
    }
    // The ones the original implementation silently left on the retired chart.
    for (const stranded of [
      'clinicalNote',
      'medicalHistoryRecord',
      'patientMedicationRecord',
      'medicationReconciliationEvent',
      'patientPharmacyRecord',
      'patientPharmacyPreference',
    ]) {
      expect(prisma[stranded].updateMany).toHaveBeenCalled();
    }
  });

  it('retires the duplicate chart and hands its code to the survivor', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    const result = await service.merge(systemAdmin, 'patient-1', 'patient-2', undefined, 'req-1');

    expect(prisma.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'patient-2' },
        data: expect.objectContaining({
          patientCode: 'NKP-2026-000099-M-PATIENT2',
          mergedIntoPatientId: 'patient-1',
          mergedByUserId: 'sysadmin-1',
          portalUserId: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      canonicalPatientId: 'patient-1',
      mergedPatientId: 'patient-2',
      mergedPatientCodeAlias: 'NKP-2026-000099',
    });
  });

  it('upserts the legacy code rather than colliding on a globally unique column', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    await service.merge(systemAdmin, 'patient-1', 'patient-2');

    expect(prisma.patientCodeAlias.upsert).toHaveBeenCalledWith({
      where: { code: 'NKP-2026-000099' },
      create: { patientId: 'patient-1', code: 'NKP-2026-000099' },
      update: { patientId: 'patient-1' },
    });
  });

  it('follows charts already merged into the duplicate, so no alias chain ends at a tombstone', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    await service.merge(systemAdmin, 'patient-1', 'patient-2');

    expect(prisma.patient.updateMany).toHaveBeenCalledWith({
      where: { mergedIntoPatientId: 'patient-2' },
      data: { mergedIntoPatientId: 'patient-1' },
    });
  });

  it('clears duplicate decisions that referenced the retired chart', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    await service.merge(systemAdmin, 'patient-1', 'patient-2');

    expect(prisma.patientDuplicateReview.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ patientAId: 'patient-2' }, { patientBId: 'patient-2' }] },
    });
  });

  it('moves every invitation, whatever state it is in', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    prisma.patientPortalInvite.findMany.mockImplementation(
      async (args: { where: { patientId: string } }) =>
        args.where.patientId === 'patient-2'
          ? [
              { id: 'invite-pending', status: 'PENDING' },
              { id: 'invite-claimed', status: 'CLAIMED' },
            ]
          : [],
    );
    prisma.patientPortalInvite.updateMany.mockResolvedValue({ count: 2 });

    await service.merge(systemAdmin, 'patient-1', 'patient-2', {
      inviteStrategy: 'CANONICAL',
    });

    // The unclaimed one is cancelled by name...
    expect(prisma.patientPortalInvite.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['invite-pending'] } },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
    });
    /*
      ...and then everything the retired chart held is repointed, claimed rows included. The
      CANONICAL branch used to move only the PENDING ones, leaving a claimed invitation -- a
      record of a real exchange with this patient -- on a chart nobody can open.
    */
    expect(prisma.patientPortalInvite.updateMany).toHaveBeenCalledWith({
      where: { patientId: 'patient-2' },
      data: { patientId: 'patient-1' },
    });
  });

  it('counts the invitations it moved, not the ones the survivor already had', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    prisma.patientPortalInvite.updateMany.mockResolvedValue({ count: 2 });
    // Would be the total on the surviving chart if this were read back with a count().
    prisma.patientPortalInvite.count.mockResolvedValue(9);

    await service.merge(systemAdmin, 'patient-1', 'patient-2');

    const record = prisma.patientMergeRecord.create.mock.calls[0][0].data;
    expect(JSON.parse(record.movedCountsJson).patientPortalInvite).toBe(2);
  });

  it('counts the aliases actually carried across, not the ones offered', async () => {
    const { service, prisma } = createService();
    stubCharts(
      prisma,
      canonicalChart(),
      chart({ ...sourceChart(), codeAliases: [{ code: 'OLD-1' }, { code: 'OLD-2' }] }),
    );
    // skipDuplicates: the surviving chart already answered to one of them.
    prisma.patientCodeAlias.createMany.mockResolvedValue({ count: 1 });

    await service.merge(systemAdmin, 'patient-1', 'patient-2');

    const record = prisma.patientMergeRecord.create.mock.calls[0][0].data;
    // One carried across, plus the code the retired chart gives up.
    expect(JSON.parse(record.movedCountsJson).patientCodeAlias).toBe(2);
  });

  it('records what it moved, so the merge can be explained later', async () => {
    const { service, prisma } = createService({ relationCounts: { encounter: [0, 5] } });
    stubCharts(prisma);

    await service.merge(systemAdmin, 'patient-1', 'patient-2', undefined, 'req-merge-1');

    const record = prisma.patientMergeRecord.create.mock.calls[0][0].data;
    expect(record).toMatchObject({
      clinicId: 'clinic-1',
      canonicalPatientId: 'patient-1',
      sourcePatientId: 'patient-2',
      sourcePatientCode: 'NKP-2026-000099',
      tombstonePatientCode: 'NKP-2026-000099-M-PATIENT2',
      portalLinkStrategy: 'CANONICAL',
      inviteStrategy: 'MERGE',
      mergedByUserId: 'sysadmin-1',
      requestId: 'req-merge-1',
    });
    expect(JSON.parse(record.movedCountsJson).encounter).toBe(5);
  });

  it('keeps the audit event, and now says how much moved', async () => {
    const { service, prisma, auditService } = createService({
      relationCounts: { appointment: [0, 2] },
    });
    stubCharts(prisma);

    await service.merge(systemAdmin, 'patient-1', 'patient-2', undefined, 'req-merge-1');

    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PATIENT.MERGE',
        entityType: 'Patient',
        entityId: 'patient-1',
        clinicId: 'clinic-1',
        requestId: 'req-merge-1',
      }),
    );
    const after = JSON.parse(auditService.logWrite.mock.calls[0][0].afterJson);
    expect(after.movedCounts.appointment).toBe(2);
    expect(after.sourcePatientCode).toBe('NKP-2026-000099');
  });

  it('refuses on a blocker, and hands back every blocker it found', async () => {
    const { service, prisma, auditService } = createService();
    prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === 'patient-1'
        ? canonicalChart()
        : chart({
            ...sourceChart(),
            primaryClinicId: 'clinic-2',
            primaryClinic: { ...CLINIC, id: 'clinic-2', name: 'Clinic Two' },
          }),
    );

    await expect(service.merge(systemAdmin, 'patient-1', 'patient-2')).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'PATIENT_MERGE_BLOCKED',
        recoveryAction: expect.stringContaining('duplicate review queue'),
      }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditService.logWrite).not.toHaveBeenCalled();
  });

  it('refuses a preview taken before the charts changed', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    await expect(
      service.merge(systemAdmin, 'patient-1', 'patient-2', {
        expectedFingerprint: '0000000000000000',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PATIENT_MERGE_PREVIEW_STALE' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the fingerprint the preview actually returned', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    const preview = await service.evaluate(systemAdmin, 'patient-1', 'patient-2');

    await expect(
      service.merge(systemAdmin, 'patient-1', 'patient-2', {
        expectedFingerprint: preview.fingerprint,
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it('re-checks inside the transaction, so a merge that lands first still wins', async () => {
    const { service, prisma } = createService();
    let reads = 0;
    prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      reads += 1;
      const merged = reads > 2; // the two evaluation reads pass, the in-transaction ones do not
      if (args.where.id === 'patient-1') return canonicalChart();
      return chart({
        ...sourceChart(),
        mergedIntoPatientId: merged ? 'patient-9' : null,
      });
    });

    await expect(service.merge(systemAdmin, 'patient-1', 'patient-2')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('is refused to anyone who is not a system administrator', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    await expect(service.merge(director, 'patient-1', 'patient-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

/*
  The half of the merge an operator chooses, and the half that runs at commit time.

  Two strategies decide what happens to portal access and to unclaimed invitations, and only the
  defaults were exercised. `SOURCE` is the branch an operator picks when the duplicate chart holds
  the sign-in the patient actually uses -- getting it wrong locks a patient out of their own
  record, which is exactly the failure this workflow exists to prevent.

  The in-transaction re-check is the other gap. It re-reads both charts after the preview a person
  spent time reading, and only one of its four refusals was covered.
*/
describe('PatientMergeService.merge - strategies and the commit-time re-check', () => {
  const SOURCE_SUB = 'kc-sub-source';
  const CANONICAL_SUB = 'kc-sub-canonical';

  /** Both charts linked to a different app account, which is what makes a strategy meaningful. */
  function stubTwoPortalAccounts(prisma: PrismaMock) {
    prisma.patientAccountLink.findUnique.mockImplementation(
      async (args: { where: { patientId: string } }) =>
        args.where.patientId === 'patient-1'
          ? { id: 'link-canonical', patientId: 'patient-1', keycloakSub: CANONICAL_SUB }
          : { id: 'link-source', patientId: 'patient-2', keycloakSub: SOURCE_SUB },
    );
  }

  it("keeps the duplicate chart's sign-in when the operator chooses it", async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    stubTwoPortalAccounts(prisma);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-source' });

    await service.merge(systemAdmin, 'patient-1', 'patient-2', {
      portalLinkStrategy: 'SOURCE',
    });

    // The old rows go, and exactly one is recreated against the surviving chart.
    expect(prisma.patientAccountLink.deleteMany).toHaveBeenCalledWith({
      where: { patientId: { in: ['patient-1', 'patient-2'] } },
    });
    expect(prisma.patientAccountLink.create).toHaveBeenCalledWith({
      data: { patientId: 'patient-1', keycloakSub: SOURCE_SUB },
    });
  });

  it("keeps the surviving chart's sign-in by default", async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    stubTwoPortalAccounts(prisma);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-canonical' });

    await service.merge(systemAdmin, 'patient-1', 'patient-2', {
      portalLinkStrategy: 'CANONICAL',
    });

    expect(prisma.patientAccountLink.create).toHaveBeenCalledWith({
      data: { patientId: 'patient-1', keycloakSub: CANONICAL_SUB },
    });
  });

  /*
    Without this the patient keeps a link row and loses the role that admits them to the clinic,
    so every portal route answers "no clinic selected" and the chart looks empty to them.
  */
  it("grants the retained account the patient role at the surviving chart's clinic", async () => {
    const { service, prisma } = createService();
    stubCharts(prisma, chart({ portalUserId: 'user-canonical' }), sourceChart());
    // Only the surviving chart is linked. Two different accounts with no strategy named is a
    // PORTAL_LINK_CONFLICT, which blocks the merge before any role is granted.
    prisma.patientAccountLink.findUnique.mockImplementation(
      async (args: { where: { patientId: string } }) =>
        args.where.patientId === 'patient-1'
          ? { id: 'link-canonical', patientId: 'patient-1', keycloakSub: CANONICAL_SUB }
          : null,
    );

    await service.merge(systemAdmin, 'patient-1', 'patient-2');

    expect(prisma.userClinicRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_clinicId_role: {
            userId: 'user-canonical',
            clinicId: 'clinic-1',
            role: UserRole.PATIENT,
          },
        },
      }),
    );
  });

  it('grants no role at all when neither chart had portal access', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    await service.merge(systemAdmin, 'patient-1', 'patient-2');

    expect(prisma.userClinicRole.upsert).not.toHaveBeenCalled();
  });

  it("cancels the surviving chart's unclaimed invitation when the operator keeps the duplicate's", async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    prisma.patientPortalInvite.findMany.mockImplementation(
      async (args: { where: { patientId: string } }) =>
        args.where.patientId === 'patient-1'
          ? [{ id: 'invite-canonical', status: 'PENDING' }]
          : [{ id: 'invite-source', status: 'PENDING' }],
    );

    await service.merge(systemAdmin, 'patient-1', 'patient-2', {
      inviteStrategy: 'SOURCE',
    });

    expect(prisma.patientPortalInvite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['invite-canonical'] } },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });

  it('records the warnings it merged under, so the decision can be read back', async () => {
    const { service, prisma } = createService();
    // A LOW-scoring pair: nothing in common but a phone number.
    stubCharts(
      prisma,
      chart({ firstName: 'Ama', lastName: 'Mensah', dob: new Date('1990-01-01') }),
      chart({
        id: 'patient-2',
        patientCode: 'NKP-2026-000099',
        firstName: 'Kofi',
        lastName: 'Owusu',
        dob: new Date('1985-05-05'),
        nationalIdHash: 'hash-b',
        nationalIdLast4: '4472',
      }),
    );

    await service.merge(systemAdmin, 'patient-1', 'patient-2');

    const record = prisma.patientMergeRecord.create.mock.calls[0][0].data;
    expect(JSON.parse(record.warningCodesJson)).toContain('WEAK_DUPLICATE_SIGNAL');
    // Warnings only. A blocker would have stopped the merge before this row was written.
    expect(JSON.parse(record.warningCodesJson)).not.toContain('CROSS_CLINIC');
  });

  it('counts the charts it re-chained and the review decisions it cleared', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);
    prisma.patient.updateMany.mockResolvedValue({ count: 2 });
    prisma.patientDuplicateReview.deleteMany.mockResolvedValue({ count: 3 });

    const result = await service.merge(systemAdmin, 'patient-1', 'patient-2');

    expect(result.movedCounts.mergedSourcePatients).toBe(2);
    expect(result.movedCounts.patientDuplicateReview).toBe(3);
  });

  it.each([
    ['a chart deleted between the preview and the commit', () => null, 'PATIENT_NOT_FOUND'],
    [
      'a chart transferred to another clinic between the preview and the commit',
      () => ({ mergedIntoPatientId: null, primaryClinicId: 'clinic-2' }),
      'CROSS_CLINIC',
    ],
  ])('refuses at commit time on %s', async (_label, freshSource, code) => {
    const { service, prisma } = createService();
    const canonical = canonicalChart();
    const source = sourceChart();
    let reads = 0;
    prisma.patient.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      reads += 1;
      // The first two reads are the evaluation's, and must succeed or the merge never reaches
      // the transaction that this test is about.
      if (reads <= 2) return args.where.id === canonical.id ? canonical : source;
      if (args.where.id === canonical.id) {
        return { mergedIntoPatientId: null, primaryClinicId: 'clinic-1' };
      }
      return freshSource();
    });

    await expect(service.merge(systemAdmin, 'patient-1', 'patient-2')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PATIENT_MERGE_BLOCKED',
        details: { blockers: [expect.objectContaining({ code })] },
      }),
    });
    // Nothing was recorded, so the retired chart is not half-merged.
    expect(prisma.patientMergeRecord.create).not.toHaveBeenCalled();
  });

  // The DTO makes the fingerprint optional, so a caller that never took a preview -- a script, or
  // the admin route used directly -- must still be able to merge.
  it('merges without a fingerprint, because the preview is optional', async () => {
    const { service, prisma } = createService();
    stubCharts(prisma);

    await expect(service.merge(systemAdmin, 'patient-1', 'patient-2')).resolves.toMatchObject({
      success: true,
    });
  });
});

describe('buildMergedPatientCode', () => {
  it('renames the retired chart deterministically from its id', () => {
    expect(buildMergedPatientCode('NKP-2026-000099', 'abcdef01-2345-4678-8abc-def012345678')).toBe(
      'NKP-2026-000099-M-ABCDEF01',
    );
  });

  // `Patient.patientCode` is a VarChar(32). A rename that overflowed it would fail the whole
  // transaction at commit, after every relation had already moved.
  it('keeps the rename inside the column it has to fit', () => {
    const long = 'NKP-2026-000099-ALREADY-VERY-LONG-CODE';

    const renamed = buildMergedPatientCode(long, 'abcdef01-2345-4678-8abc-def012345678');

    expect(renamed.length).toBeLessThanOrEqual(32);
  });
});
