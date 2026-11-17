import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  digestText,
  flagFor,
  FollowUpFlagService,
  FOLLOW_UP_FLAGS_DAILY_JOB,
  URGENT_ESCALATION_JOB,
  type TierChange,
} from './follow-up-flags.service';

const FLAG = 'FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED';

function change(overrides: Partial<TierChange> = {}): TierChange {
  return {
    clinicId: 'c1',
    patientId: 'p1',
    assessmentId: 'a1',
    previous: { tier: 'MODERATE', reasons: ['CHART_RISK'] },
    current: { tier: 'URGENT', reasons: ['DANGER_BP_WITH_SYMPTOMS'] },
    direction: 'UP',
    trigger: 'HYPERTENSION',
    actorUserId: 'vol-actor',
    ...overrides,
  };
}

describe('flagFor (#337)', () => {
  it('raises URGENT on a move into Urgent, from anywhere, and on a first tier of Urgent', () => {
    expect(flagFor(change())).toBe('URGENT');
    expect(flagFor(change({ previous: null, direction: 'NEW' }))).toBe('URGENT');
  });

  it('stays quiet when the patient was already Urgent', () => {
    expect(
      flagFor(change({ previous: { tier: 'URGENT', reasons: [] }, direction: 'SAME' })),
    ).toBeNull();
  });

  it('raises HIGH on a move up to High only', () => {
    const high = { tier: 'HIGH' as const, reasons: ['MISSED_CONTACT'] };
    expect(flagFor(change({ current: high }))).toBe('HIGH');
    expect(flagFor(change({ current: high, previous: null, direction: 'NEW' }))).toBeNull();
    expect(
      flagFor(
        change({ current: high, previous: { tier: 'HIGH', reasons: [] }, direction: 'SAME' }),
      ),
    ).toBeNull();
  });

  it('raises SEVERE_BP when that reason is new, whether or not the tier moved', () => {
    const severe = { tier: 'HIGH' as const, reasons: ['SEVERE_BP_ASYMPTOMATIC'] };
    expect(flagFor(change({ current: severe }))).toBe('SEVERE_BP');
    expect(
      flagFor(
        change({ current: severe, previous: { tier: 'HIGH', reasons: [] }, direction: 'SAME' }),
      ),
    ).toBe('SEVERE_BP');
    expect(flagFor(change({ current: severe, previous: severe, direction: 'SAME' }))).toBeNull();
  });

  it('never notifies a move down or becoming Stable', () => {
    expect(
      flagFor(
        change({
          previous: { tier: 'HIGH', reasons: [] },
          current: { tier: 'STABLE', reasons: ['ON_TREATMENT_AT_TARGET'] },
          direction: 'DOWN',
        }),
      ),
    ).toBeNull();
  });

  it('stays quiet for a backfill or a merge', () => {
    expect(flagFor(change({ trigger: 'BACKFILL' }))).toBeNull();
    expect(flagFor(change({ trigger: 'MERGE' }))).toBeNull();
  });
});

describe('digestText', () => {
  it('gives counts only, and says when an urgent patient has nobody', () => {
    expect(digestText({ clinicName: 'Hohoe', urgent: 3, unclaimed: 1, high: 12 })).toEqual({
      title: 'Hohoe: 3 urgent, 12 high risk',
      body: '1 urgent patient has nobody on it yet.',
    });
    expect(digestText({ clinicName: 'Hohoe', urgent: 0, unclaimed: 0, high: 2 }).body).toBe(
      'Nobody is urgent today.',
    );
  });

  it('adds the week of follow-up contacts and how many are late (#338)', () => {
    expect(
      digestText({
        clinicName: 'Hohoe',
        urgent: 0,
        unclaimed: 0,
        high: 0,
        contactsDueThisWeek: 9,
        contactsLate: 1,
      }),
    ).toEqual({
      title: 'Hohoe: 9 contacts due this week',
      body: 'Nobody is urgent today. 1 follow-up contact is late.',
    });
  });
});

function setup() {
  const tx = {
    patientRiskFlag: {
      create: jest.fn().mockResolvedValue({ id: 'flag-1' }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    patient: {
      findUnique: jest.fn().mockResolvedValue({ firstName: 'Ama', lastName: 'Mensah' }),
      findFirst: jest.fn().mockResolvedValue({ currentRiskTier: 'URGENT' }),
    },
    staffShift: {
      findMany: jest.fn().mockResolvedValue([
        { userId: 'doc-on', roleAtShift: 'DOCTOR' },
        { userId: 'vol-actor', roleAtShift: 'VOLUNTEER' },
      ]),
    },
    userClinicRole: {
      findMany: jest.fn().mockResolvedValue([
        { userId: 'mgr', role: 'MANAGER' },
        { userId: 'dir', role: 'DIRECTOR' },
      ]),
    },
    encounter: {
      findUnique: jest.fn().mockResolvedValue({
        patient: { id: 'p1', firstName: 'Ama', lastName: 'Mensah', currentRiskTier: 'MODERATE' },
      }),
    },
    followUpContact: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    followUpAttempt: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    riskFlagAcknowledgement: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    inboxNotification: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    withSystemContext: jest.fn((_ctx, callback) => callback(tx)),
    detachFromRlsContext: jest.fn((callback) => callback()),
    afterCommit: jest.fn((work) => work()),
  };
  const push = { notify: jest.fn(), handleScreeningAlertsWith: jest.fn() };
  const audit = { logWrite: jest.fn() };
  const scheduler = {
    register: jest.fn(),
    delay: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  const service = new FollowUpFlagService(
    prisma as never,
    push as never,
    audit as never,
    scheduler as never,
  );
  return { service, tx, push, audit, scheduler };
}

describe('FollowUpFlagService', () => {
  const saved = process.env[FLAG];
  beforeEach(() => (process.env[FLAG] = 'true'));
  afterAll(() => (process.env[FLAG] = saved));

  it('with the flag off: raises nothing, schedules nothing, refuses acknowledgement', async () => {
    process.env[FLAG] = 'false';
    const { service, tx, push, scheduler } = setup();
    service.onModuleInit();
    await service.raise(change());
    await service.escalate('flag-1');
    await service.daily();
    expect(tx.patientRiskFlag.create).not.toHaveBeenCalled();
    expect(push.notify).not.toHaveBeenCalled();
    expect(scheduler.delay).not.toHaveBeenCalled();
    // Only the escalation handler, which runs nothing while the flag is off.
    expect(scheduler.register.mock.calls.map(([sweep]) => sweep.jobName)).toEqual([
      URGENT_ESCALATION_JOB,
    ]);
    await expect(service.acknowledge('c1', 'p1', 'u1')).rejects.toThrow();
  });

  it('registers the daily job at 07:00 Accra, and takes over screening alerts', () => {
    const { service, push, scheduler } = setup();
    service.onModuleInit();
    const daily = scheduler.register.mock.calls
      .map(([sweep]) => sweep)
      .find((sweep) => sweep.jobName === FOLLOW_UP_FLAGS_DAILY_JOB);
    expect(daily).toMatchObject({ cron: { pattern: '0 7 * * *', tz: 'Africa/Accra' } });
    expect(daily.everyMs).toBeUndefined();
    expect(push.handleScreeningAlertsWith).toHaveBeenCalledTimes(1);
  });

  it("moves the absorbed chart's flags to the surviving chart after a merge, flag on or off", async () => {
    process.env[FLAG] = 'false';
    const { service, tx } = setup();
    await service.moveAfterMerge('p-old', 'p-new');
    const move = { where: { patientId: 'p-old' }, data: { patientId: 'p-new' } };
    expect(tx.patientRiskFlag.updateMany).toHaveBeenCalledWith(move);
    expect(tx.followUpContact.updateMany).toHaveBeenCalledWith(move);
    expect(tx.followUpAttempt.updateMany).toHaveBeenCalledWith(move);
  });

  describe('screening alerts', () => {
    const alert = {
      clinicId: 'c1',
      encounterId: 'e1',
      actorUserId: 'vol-actor',
      findings: ['Chest pain'],
    };

    it('a patient the engine does not call Urgent: a screening flag with an owner and a timer', async () => {
      const { service, tx, push, scheduler } = setup();
      tx.patientRiskFlag.findFirst.mockResolvedValue({ id: 'flag-s' });
      await service.sendScreeningAlert(alert);
      expect(tx.patientRiskFlag.createMany).toHaveBeenCalledWith({
        data: [
          {
            clinicId: 'c1',
            patientId: 'p1',
            encounterId: 'e1',
            kind: 'SCREENING_URGENT',
            detail: 'Chest pain',
          },
        ],
        skipDuplicates: true,
      });
      const [recipients, message] = push.notify.mock.calls[0];
      expect([...recipients].sort()).toEqual(['doc-on', 'mgr']);
      expect(message).toMatchObject({
        title: 'A patient needs urgent review',
        body: 'Open Nkwapa to see who.',
        tag: 'risk-p1-HEALTH_ALERT',
        url: '/clinics/c1/patients/p1?tab=overview',
        riskFlagId: 'flag-s',
        inbox: { title: 'Ama Mensah needs urgent review' },
      });
      expect(scheduler.delay).toHaveBeenCalledWith(
        URGENT_ESCALATION_JOB,
        'urgent-escalation-flag-s',
        { flagId: 'flag-s' },
        15 * 60_000,
      );
    });

    it('a second finding on the same visit joins its flag and sets no second timer', async () => {
      const { service, tx, scheduler } = setup();
      tx.patientRiskFlag.createMany.mockResolvedValue({ count: 0 });
      tx.patientRiskFlag.findFirst.mockResolvedValue({ id: 'flag-s' });
      await service.sendScreeningAlert({
        ...alert,
        findings: ['Chest pain', 'Low blood pressure'],
      });
      expect(tx.patientRiskFlag.updateMany).toHaveBeenCalledWith({
        where: { encounterId: 'e1', kind: 'SCREENING_URGENT' },
        data: { detail: 'Chest pain. Low blood pressure' },
      });
      expect(scheduler.delay).not.toHaveBeenCalled();
    });

    it('an Urgent patient: joins their open Urgent flag, no new flag or timer', async () => {
      const { service, tx, push, scheduler } = setup();
      tx.encounter.findUnique.mockResolvedValue({
        patient: { id: 'p1', firstName: 'Ama', lastName: 'Mensah', currentRiskTier: 'URGENT' },
      });
      tx.patientRiskFlag.findFirst.mockResolvedValue({ id: 'flag-u' });
      await service.sendScreeningAlert(alert);
      expect(tx.patientRiskFlag.createMany).not.toHaveBeenCalled();
      expect(push.notify.mock.calls[0][1].riskFlagId).toBe('flag-u');
      expect(scheduler.delay).not.toHaveBeenCalled();
    });
  });

  it('an urgent move: one flag, on-shift staff and managers told, recorder left out, timer set', async () => {
    const { service, tx, push, scheduler } = setup();
    await service.raise(change());
    expect(tx.patientRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { clinicId: 'c1', patientId: 'p1', assessmentId: 'a1', kind: 'URGENT' },
      }),
    );
    const [recipients, message] = push.notify.mock.calls[0];
    expect([...recipients].sort()).toEqual(['doc-on', 'mgr']);
    expect(message).toMatchObject({
      kind: 'HEALTH_ALERT',
      tag: 'risk-p1-HEALTH_ALERT',
      url: '/clinics/c1/patients/p1?tab=overview',
      riskFlagId: 'flag-1',
      inbox: { title: 'Ama Mensah needs urgent review' },
    });
    expect(scheduler.delay).toHaveBeenCalledWith(
      URGENT_ESCALATION_JOB,
      'urgent-escalation-flag-1',
      { flagId: 'flag-1' },
      15 * 60_000,
    );
  });

  it('keeps the name, reading and reason off the lock screen', async () => {
    const { service, push } = setup();
    await service.raise(change());
    const { title, body, url, tag } = push.notify.mock.calls[0][1];
    const lockScreen = JSON.stringify({ title, body, url, tag });
    expect(lockScreen).not.toMatch(/Ama|Mensah|blood pressure|danger/i);
    expect(title).toBe('A patient needs urgent review');
    expect(body).toBe('Open Nkwapa to see who.');
  });

  it('tells nobody twice: an assessment that already raised its flag is a no-op', async () => {
    const { service, tx, push, scheduler } = setup();
    tx.patientRiskFlag.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await service.raise(change());
    expect(push.notify).not.toHaveBeenCalled();
    expect(scheduler.delay).not.toHaveBeenCalled();
  });

  it('a move up to High goes to FOLLOW_UP.MANAGE holders as RISK_TIER_CHANGE', async () => {
    const { service, push, scheduler } = setup();
    await service.raise(
      change({ current: { tier: 'HIGH', reasons: ['CHART_RISK', 'MISSED_CONTACT'] } }),
    );
    const [recipients, message] = push.notify.mock.calls[0];
    expect([...recipients].sort()).toEqual(['doc-on', 'mgr']);
    expect(message).toMatchObject({
      kind: 'RISK_TIER_CHANGE',
      tag: 'risk-p1-RISK_TIER_CHANGE',
      inbox: { body: 'Missed a follow-up contact. Follow up on the High rhythm.' },
    });
    expect(scheduler.delay).not.toHaveBeenCalled();
  });

  it('never throws out of raise', async () => {
    const { service, tx } = setup();
    tx.patientRiskFlag.create.mockRejectedValue(new Error('db down'));
    await expect(service.raise(change())).resolves.toBeUndefined();
  });

  describe('acknowledge', () => {
    it('records who, marks every tile on the flag read, and cancels the escalation', async () => {
      const { service, tx, scheduler, audit } = setup();
      const ack = { userId: 'doc-on', createdAt: new Date(), user: { displayName: 'Kofi' } };
      tx.patientRiskFlag.findFirst
        .mockResolvedValueOnce({ id: 'flag-1', raisedAt: new Date(), acknowledgement: null })
        .mockResolvedValueOnce({ id: 'flag-1', raisedAt: new Date(), acknowledgement: ack });
      const result = await service.acknowledge('c1', 'p1', 'doc-on');
      expect(result.displayName).toBe('Kofi');
      expect(tx.riskFlagAcknowledgement.createMany).toHaveBeenCalledWith({
        data: [{ clinicId: 'c1', flagId: 'flag-1', userId: 'doc-on' }],
        skipDuplicates: true,
      });
      expect(tx.inboxNotification.updateMany).toHaveBeenCalledWith({
        where: { riskFlagId: 'flag-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(audit.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FOLLOW_UP_FLAG_ACKNOWLEDGED', entityId: 'flag-1' }),
        tx,
      );
      expect(scheduler.cancel).toHaveBeenCalledWith('urgent-escalation-flag-1');
    });

    it('returns the first owner when someone already took it', async () => {
      const { service, tx } = setup();
      const ack = { userId: 'mgr', createdAt: new Date(), user: { displayName: 'Akua' } };
      tx.patientRiskFlag.findFirst.mockResolvedValue({
        id: 'flag-1',
        raisedAt: new Date(),
        acknowledgement: ack,
      });
      expect((await service.acknowledge('c1', 'p1', 'doc-on')).displayName).toBe('Akua');
      expect(tx.riskFlagAcknowledgement.createMany).not.toHaveBeenCalled();
    });

    it('refuses a patient who is not Urgent now', async () => {
      const { service, tx } = setup();
      tx.patient.findFirst.mockResolvedValue({ currentRiskTier: 'HIGH' });
      await expect(service.acknowledge('c1', 'p1', 'doc-on')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('escalate', () => {
    // #334: a single crisis reading a calmer repeat did not confirm is not escalated.
    it('stands down when a repeat settled the only finding, and escalates when it did not', async () => {
      const visit = (repeat: number | null, htnReasons: string[], dmReasons: string[] = []) => ({
        kind: 'SCREENING_URGENT',
        encounter: {
          hypertensionAssessment: {
            repeatSystolicBp: repeat,
            repeatDiastolicBp: repeat === null ? null : 80,
            urgentReviewReasons: htnReasons,
          },
          diabetesScreening: { urgentReviewReasons: dmReasons },
        },
      });
      const run = async (row: unknown) => {
        const { service, tx, push } = setup();
        tx.patientRiskFlag.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({
          clinicId: 'c1',
          patientId: 'p1',
          patient: { firstName: 'Ama', lastName: 'Mensah' },
        });
        await service.escalate('flag-s');
        return push.notify.mock.calls.length;
      };
      expect(await run(visit(132, []))).toBe(0);
      expect(await run(visit(null, []))).toBe(1);
      expect(await run(visit(132, ['URGENT_SYMPTOM_CHEST_PAIN']))).toBe(1);
      expect(await run(visit(132, [], ['HYPOGLYCEMIA']))).toBe(1);
    });

    it('tells managers and directors once, after claiming the flag', async () => {
      const { service, tx, push } = setup();
      tx.patientRiskFlag.findUnique.mockResolvedValue({
        clinicId: 'c1',
        patientId: 'p1',
        patient: { firstName: 'Ama', lastName: 'Mensah' },
      });
      await service.escalate('flag-1');
      expect(tx.patientRiskFlag.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'flag-1',
          escalatedAt: null,
          acknowledgement: { is: null },
          OR: expect.arrayContaining([{ kind: 'URGENT', patient: { currentRiskTier: 'URGENT' } }]),
        }),
        data: { escalatedAt: expect.any(Date) },
      });
      const [recipients, message] = push.notify.mock.calls[0];
      expect([...recipients].sort()).toEqual(['dir', 'mgr']);
      expect(message.title).toBe('An urgent patient has not been picked up');

      tx.patientRiskFlag.updateMany.mockResolvedValue({ count: 0 });
      await service.escalate('flag-1');
      expect(push.notify).toHaveBeenCalledTimes(1);
    });
  });

  it('daily: flags a patient still High after six months, once, to the clinic doctors', async () => {
    const { service, tx, push } = setup();
    tx.userClinicRole.findMany.mockResolvedValue([
      { userId: 'doc-a', role: 'DOCTOR' },
      { userId: 'mgr', role: 'MANAGER' },
    ]);
    tx.$queryRaw.mockResolvedValueOnce([{ clinicId: 'c1', patientId: 'p1', assessmentId: 'a0' }]);
    await service.daily(new Date('2026-11-16T00:00:00Z'));
    expect(tx.patientRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'NOT_IMPROVING' }) }),
    );
    expect(push.notify.mock.calls[0][0]).toEqual(['doc-a']);
    expect(push.notify.mock.calls[0][1].inbox.title).toBe(
      'Ama Mensah is still high risk after 6 months',
    );
  });

  it('daily digest: directors get one tile of counts per clinic', async () => {
    const { service, tx, push } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { clinicId: 'c1', clinicName: 'Hohoe', urgent: 1, unclaimed: 1, high: 4 },
      ]);
    await service.daily();
    const [recipients, message] = push.notify.mock.calls[0];
    expect(recipients).toEqual(['dir']);
    expect(message).toMatchObject({
      kind: 'FOLLOW_UP_DUE',
      tag: 'follow-up-digest-c1',
      inbox: { title: 'Hohoe: 1 urgent, 4 high risk' },
    });
  });
});
