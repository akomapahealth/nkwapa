import { Test, TestingModule } from '@nestjs/testing';
import { CLAIM_REFUSAL_LABELS } from '@nkwapa/db';
import { PatientPortalService } from './patient-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { EmailDeliverabilityService } from '../common/email-policy';
import {
  FIXTURE_CLINIC_ID,
  FIXTURE_INVITE_ID,
  FIXTURE_KEYCLOAK_SUB,
  FIXTURE_PATIENT_CODE,
  FIXTURE_PATIENT_ID,
  FIXTURE_PORTAL_USER_ID,
  FIXTURE_SOURCE_PATIENT_CODE,
  IDENTITY_NOW,
  claimUserFixture,
  createIdentityPrismaMock,
  identityDay,
  portalInviteFixture,
} from '../testing/patient-identity-fixtures';
import { CLAIM_REFUSAL_CASES } from '../testing/patient-identity-matrix';

/*
  Claiming a record, end to end.

  This is the only identity workflow a patient drives alone: no staff member beside them, no
  clinic able to see what they saw. It is also the one that hands somebody a whole medical
  record, so every branch is either "the right person gets in" or "the wrong person does not".

  The existing lifecycle suite covered the expiry states and two of the mismatches. What was
  missing was most of the rest -- notably that no test had ever claimed by phone, though a
  phone-only invitation is the normal case for a patient with no email address.
*/
describe('claiming a patient record', () => {
  let service: PatientPortalService;
  let prisma: ReturnType<typeof createIdentityPrismaMock>;
  let auditService: { logWrite: jest.Mock };

  const DOB = new Date('1998-07-22T00:00:00.000Z');

  const claimDto = {
    inviteId: FIXTURE_INVITE_ID,
    patientCode: FIXTURE_PATIENT_CODE,
    dob: '1998-07-22',
  };

  /** The chart an invitation points at: claimable unless a test says otherwise. */
  function claimableChart(overrides: Record<string, unknown> = {}) {
    return {
      id: FIXTURE_PATIENT_ID,
      patientCode: FIXTURE_PATIENT_CODE,
      dob: DOB,
      mergedIntoPatientId: null,
      codeAliases: [],
      ...overrides,
    };
  }

  /** Point the claimable-invite lookup at a live invitation for that chart. */
  function stubClaimableInvite(
    inviteOverrides: Record<string, unknown> = {},
    patientOverrides: Record<string, unknown> = {},
  ) {
    prisma.patientPortalInvite.findFirst.mockResolvedValue({
      ...portalInviteFixture(inviteOverrides),
      patient: claimableChart(patientOverrides),
    });
  }

  /** No claimable invitation, but a row that exists in the state given. */
  function stubLapsedInvite(row: Record<string, unknown>) {
    prisma.patientPortalInvite.findFirst.mockResolvedValue(null);
    prisma.patientPortalInvite.findUnique.mockResolvedValue({
      id: FIXTURE_INVITE_ID,
      clinicId: FIXTURE_CLINIC_ID,
      status: 'PENDING',
      expiresAt: null,
      ...row,
    });
  }

  async function refusalOf(promise: Promise<unknown>) {
    try {
      await promise;
      throw new Error('expected the claim to be refused, but it was accepted');
    } catch (error) {
      const thrown = error as { getStatus?: () => number; getResponse?: () => unknown };
      if (typeof thrown.getStatus !== 'function') throw error;
      return {
        status: thrown.getStatus(),
        body: thrown.getResponse!() as { code?: string; message?: string; recoveryAction?: string },
      };
    }
  }

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(IDENTITY_NOW);
    prisma = createIdentityPrismaMock();
    auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };

    prisma.user.findUnique.mockResolvedValue(claimUserFixture());
    prisma.patientAccountLink.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientPortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        {
          provide: ReminderService,
          useValue: { sendNotificationNow: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: EmailDeliverabilityService,
          useValue: { assertDomainAcceptsEmail: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(PatientPortalService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('every refusal carries a code and a way out', () => {
    /** Put the service into the state each matrix row describes. */
    const stage: Record<string, () => void> = {
      ACCOUNT_INACTIVE: () => {
        prisma.user.findUnique.mockResolvedValue(claimUserFixture({ isActive: false }));
      },
      INVITE_NOT_FOUND: () => {
        prisma.patientPortalInvite.findFirst.mockResolvedValue(null);
        prisma.patientPortalInvite.findUnique.mockResolvedValue(null);
      },
      INVITE_EXPIRED: () => stubLapsedInvite({ expiresAt: identityDay(-3) }),
      INVITE_CANCELLED: () => stubLapsedInvite({ status: 'CANCELLED' }),
      INVITE_ALREADY_USED: () => stubLapsedInvite({ status: 'CLAIMED' }),
      RECORD_MERGED: () => stubClaimableInvite({}, { mergedIntoPatientId: 'patient-9' }),
      CONTACT_MISMATCH: () => {
        prisma.user.findUnique.mockResolvedValue(
          claimUserFixture({ email: 'someone@else.test', phoneE164: null }),
        );
        stubClaimableInvite();
      },
      PATIENT_CODE_MISMATCH: () => stubClaimableInvite({}, { patientCode: 'NKP-2026-999999' }),
      DATE_OF_BIRTH_MISSING: () => stubClaimableInvite({}, { dob: null }),
      DATE_OF_BIRTH_MISMATCH: () =>
        stubClaimableInvite({}, { dob: new Date('1990-01-01T00:00:00.000Z') }),
      ACCOUNT_ALREADY_LINKED: () => {
        stubClaimableInvite();
        prisma.patientAccountLink.findUnique.mockImplementation(
          async ({ where }: { where: { keycloakSub?: string } }) =>
            where.keycloakSub
              ? { id: 'link-1', patientId: 'patient-other', keycloakSub: FIXTURE_KEYCLOAK_SUB }
              : null,
        );
      },
      RECORD_ALREADY_LINKED: () => {
        stubClaimableInvite();
        prisma.patientAccountLink.findUnique.mockImplementation(
          async ({ where }: { where: { patientId?: string } }) =>
            where.patientId
              ? { id: 'link-1', patientId: FIXTURE_PATIENT_ID, keycloakSub: 'kc-sub-someone-else' }
              : null,
        );
      },
    };

    it.each(CLAIM_REFUSAL_CASES.map((entry) => [entry.code, entry] as const))(
      '%s answers with its own code, status and next step',
      async (code, outcome) => {
        stage[code]();

        const refusal = await refusalOf(
          service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1'),
        );

        expect(refusal.status).toBe(outcome.status);
        expect(refusal.body.code).toBe(code);
        // Never a dead end: every refusal names something the patient can do.
        expect(refusal.body.recoveryAction).toBeTruthy();
      },
    );

    it('names the date a lapsed invitation expired, rather than only that it did', async () => {
      stage.INVITE_EXPIRED();

      const refusal = await refusalOf(
        service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1'),
      );

      expect(refusal.body.message).toMatch(/expired on 30 August 2026/);
    });

    /*
      Not a cosmetic difference. A row the hourly sweep has already settled to EXPIRED carries no
      usable expiry instant to quote, so the two paths say different things -- and a patient who
      is told a date can tell whether the clinic already knows they are late.
    */
    it('falls back to undated wording for an invitation the sweep already settled', async () => {
      stubLapsedInvite({ status: 'EXPIRED', expiresAt: null });

      const refusal = await refusalOf(
        service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1'),
      );

      expect(refusal.body.message).toBe(CLAIM_REFUSAL_LABELS.INVITE_EXPIRED);
    });

    /*
      Order matters, and it is a disclosure decision rather than a style one. Identity is checked
      before the patient code, so an account that was never invited cannot use the claim form to
      discover whether a code it guessed belongs to a real chart.
    */
    it('refuses on identity before it looks at the patient code', async () => {
      prisma.user.findUnique.mockResolvedValue(
        claimUserFixture({ email: 'someone@else.test', phoneE164: null }),
      );
      stubClaimableInvite();

      const refusal = await refusalOf(
        service.claimPatientRecord(
          FIXTURE_PORTAL_USER_ID,
          { ...claimDto, patientCode: 'NKP-2026-999999' },
          'req-1',
        ),
      );

      expect(refusal.body.code).toBe('CONTACT_MISMATCH');
    });

    it('writes nothing on any refusal, because the request transaction would undo it', async () => {
      for (const outcome of CLAIM_REFUSAL_CASES) {
        jest.clearAllMocks();
        prisma.user.findUnique.mockResolvedValue(claimUserFixture());
        prisma.patientAccountLink.findUnique.mockResolvedValue(null);
        stage[outcome.code]();

        await refusalOf(service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1'));

        expect(prisma.patientAccountLink.upsert).not.toHaveBeenCalled();
        expect(prisma.patient.update).not.toHaveBeenCalled();
        expect(prisma.patientPortalInvite.update).not.toHaveBeenCalled();
        expect(auditService.logWrite).not.toHaveBeenCalled();
      }
    });
  });

  describe('the routes a claim is accepted by', () => {
    it('accepts an account whose email matches, whatever the case', async () => {
      prisma.user.findUnique.mockResolvedValue(claimUserFixture({ email: 'AMA@Example.com' }));
      stubClaimableInvite({ email: 'ama@example.com' });

      await expect(
        service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1'),
      ).resolves.toMatchObject({ success: true, patientId: FIXTURE_PATIENT_ID });
    });

    /*
      The gap that mattered most. Every claim test before this one signed in with an email
      address, but a phone-only invitation is the ordinary case for a patient who has no email --
      and nothing proved those patients could get in at all.
    */
    it('accepts a phone-only invitation claimed from a phone-only account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        claimUserFixture({ email: null, phoneE164: '+233240000000' }),
      );
      stubClaimableInvite({ email: null, phoneE164: '+233240000000' });

      await expect(
        service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1'),
      ).resolves.toMatchObject({ success: true });
    });

    it('accepts a matching phone even when the email disagrees', async () => {
      prisma.user.findUnique.mockResolvedValue(
        claimUserFixture({ email: 'someone@else.test', phoneE164: '+233240000000' }),
      );
      stubClaimableInvite({ email: 'ama@example.com', phoneE164: '+233240000000' });

      await expect(
        service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1'),
      ).resolves.toMatchObject({ success: true });
    });

    // The reason the claim reads code aliases at all: after a merge the patient still holds the
    // card printed with their old code.
    it('accepts the code a chart answered to before a merge', async () => {
      stubClaimableInvite({}, { codeAliases: [{ code: FIXTURE_SOURCE_PATIENT_CODE }] });

      await expect(
        service.claimPatientRecord(
          FIXTURE_PORTAL_USER_ID,
          { ...claimDto, patientCode: FIXTURE_SOURCE_PATIENT_CODE },
          'req-1',
        ),
      ).resolves.toMatchObject({ success: true });
    });

    it('accepts a code typed in lower case with stray spaces', async () => {
      stubClaimableInvite();

      await expect(
        service.claimPatientRecord(
          FIXTURE_PORTAL_USER_ID,
          { ...claimDto, patientCode: '  nkp-2026-000001  ' },
          'req-1',
        ),
      ).resolves.toMatchObject({ success: true });
    });
  });

  describe('what an accepted claim actually does', () => {
    beforeEach(() => {
      stubClaimableInvite();
    });

    it('links the account, marks the record claimed, and grants the patient role', async () => {
      await service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1');

      expect(prisma.patientAccountLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: FIXTURE_PATIENT_ID } }),
      );
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: FIXTURE_PATIENT_ID },
        data: { portalUserId: FIXTURE_PORTAL_USER_ID },
      });
      expect(prisma.userClinicRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_clinicId_role: {
              userId: FIXTURE_PORTAL_USER_ID,
              clinicId: FIXTURE_CLINIC_ID,
              role: 'PATIENT',
            },
          },
        }),
      );
    });

    it('settles the invitation it used', async () => {
      await service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1');

      expect(prisma.patientPortalInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FIXTURE_INVITE_ID },
          data: expect.objectContaining({
            status: 'CLAIMED',
            claimedByUserId: FIXTURE_PORTAL_USER_ID,
          }),
        }),
      );
    });

    /*
      A record can be invited more than once -- staff resend, or mistype an address and try
      again. Leaving the losing invitations PENDING would leave a second working way into the
      same record, which is the state this whole workflow exists to prevent.
    */
    it('cancels every other unclaimed invitation for the same record', async () => {
      await service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1');

      expect(prisma.patientPortalInvite.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patientId: FIXTURE_PATIENT_ID,
            status: 'PENDING',
            id: { not: FIXTURE_INVITE_ID },
          }),
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });

    it('audits the claim against the link it created', async () => {
      await service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1');

      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PATIENT.PORTAL.CLAIM',
          entityType: 'PatientAccountLink',
          requestId: 'req-1',
        }),
      );
    });

    /*
      The mutation is one transaction; the audit is not in it. That ordering is deliberate --
      the RLS interceptor already wraps the request, and an audit write inside the same
      transaction is rolled back by any later failure. Pinning it here means a refactor that
      moves the audit inside is a failing test rather than a silently unauditable claim.
    */
    it('does the work in one transaction and audits after it commits', async () => {
      await service.claimPatientRecord(FIXTURE_PORTAL_USER_ID, claimDto, 'req-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const transactionOrder = prisma.$transaction.mock.invocationCallOrder[0];
      const auditOrder = auditService.logWrite.mock.invocationCallOrder[0];
      expect(auditOrder).toBeGreaterThan(transactionOrder);
    });
  });
});
