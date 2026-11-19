import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ReferralReportService, ageOn } from './referral-report.service';
import type { CreateReferralReportDto } from './dto/referral-report.dto';

const CLINIC = 'clinic-1';
const PATIENT = 'patient-1';
const doctor = { userId: 'doctor-1', roles: [{ clinicId: CLINIC, role: UserRole.DOCTOR }] };
const volunteer = { userId: 'vol-1', roles: [{ clinicId: CLINIC, role: UserRole.VOLUNTEER }] };

const patient = {
  id: PATIENT,
  patientCode: 'NKP-2026-000042',
  firstName: 'Yaa',
  middleName: null,
  lastName: 'Asantewaa',
  sex: 'FEMALE',
  dob: new Date('1961-02-03T00:00:00Z'),
  phoneE164: '+233241234567',
  nationalIdLast4: '4821',
  residentialDigitalAddress: 'AK-039-5028',
  residentialCommunity: 'Bantama',
  residentialDistrict: null,
  residentialRegion: 'ASHANTI',
  residentialLandmark: null,
};

const glance = {
  generatedAt: new Date(),
  conditions: {
    history: [],
    screening: { hypertension: null, diabetes: null, diabetesType: null },
  },
  bloodPressure: { latest: null, previous: [], direction: 'NOT_ENOUGH_DATA' },
  glucose: { latest: null, previous: [], direction: 'NOT_ENOUGH_DATA', hba1c: null },
  medications: null,
  risks: null,
  screenings: [],
  care: { visits: 0, lastVisitAt: null, followUp: null },
};

function setup(overrides: { emailOk?: boolean; referralConsent?: object | null } = {}) {
  const none = jest.fn().mockResolvedValue(null);
  const empty = jest.fn().mockResolvedValue([]);
  const prisma = {
    patient: { findFirst: jest.fn().mockResolvedValue(patient) },
    clinic: {
      findUnique: jest.fn().mockResolvedValue({
        id: CLINIC,
        name: 'Bantama Clinic',
        region: 'Ashanti',
        address: null,
        contactPhone: '+233322000000',
        contactEmail: null,
        timezone: 'Africa/Accra',
        glucoseUnit: 'MMOL_L',
        hba1cUnit: 'PERCENT',
      }),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ firstName: 'Ama', lastName: 'Boateng', displayName: 'Ama B' }),
    },
    medicalHistoryRecord: { findMany: empty },
    vitals: { findMany: empty },
    diabetesScreening: { findMany: empty, findFirst: none },
    hypertensionAssessment: { findFirst: none },
    patientMedicationRecord: { findMany: empty },
    medicationReconciliationEvent: { findFirst: none },
    prescription: { findMany: jest.fn().mockResolvedValue([]) },
    eyeScreening: { findFirst: none },
    carePlan: { findFirst: none },
    clinicalNote: { findMany: empty },
    patientConsent: { findFirst: jest.fn().mockResolvedValue(overrides.referralConsent ?? null) },
  };
  const chart = { getSummary: jest.fn().mockResolvedValue({ glance }) };
  const history = {
    getAllergySummary: jest
      .fn()
      .mockResolvedValue({ state: 'NOT_RECORDED', activeAllergies: [], updatedAt: null }),
  };
  const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
  const email = {
    send: jest
      .fn()
      .mockResolvedValue(
        overrides.emailOk === false
          ? { success: false, error: 'EMAIL_SEND_FAILED' }
          : { success: true },
      ),
  };
  const service = new ReferralReportService(
    prisma as never,
    chart as never,
    history as never,
    audit as never,
    email as never,
  );
  return { service, prisma, audit, email };
}

const dto = (extra: Partial<CreateReferralReportDto> = {}): CreateReferralReportDto => ({
  reason: 'Hypertensive retinopathy suspected',
  urgency: 'URGENT',
  recipientFacility: 'Regional Hospital',
  delivery: 'DOWNLOAD',
  patientAgreedToday: true,
  ...extra,
});

describe('ReferralReportService (#344)', () => {
  const env = { ...process.env };
  beforeAll(() => {
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'true';
    process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = 'true';
    process.env.FEATURE_CLINICAL_NOTES_ENABLED = 'true';
  });
  afterAll(() => {
    process.env = env;
  });

  it('returns the file and the passcode, and audits without the passcode', async () => {
    const { service, audit } = setup();
    const result = await service.create(CLINIC, PATIENT, doctor, dto());
    if (result.delivery !== 'DOWNLOAD') throw new Error('expected a download');
    expect(result.passcode).toMatch(/^[A-Z2-9]{16}$/);
    expect(Buffer.from(result.file, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.filename).toBe(
      `referral-NKP-2026-000042-${new Date().toISOString().slice(0, 10)}.pdf`,
    );

    expect(audit.logWrite).toHaveBeenCalledTimes(1);
    const entry = audit.logWrite.mock.calls[0][0];
    expect(entry).toMatchObject({
      action: 'REFERRAL_REPORT.EXPORT',
      entityType: 'Patient',
      entityId: PATIENT,
      actorUserId: 'doctor-1',
    });
    const after = JSON.parse(entry.afterJson);
    expect(after).toMatchObject({
      delivery: 'DOWNLOAD',
      recipientFacility: 'Regional Hospital',
      patientAgreedToday: true,
      consentBasis: 'AGREED_TODAY',
      consentId: null,
      sections: ['SUMMARY', 'HISTORY', 'READINGS', 'MEDICATIONS', 'ASSESSMENTS', 'PLAN'],
    });
    expect(JSON.stringify(entry)).not.toContain(result.passcode);
  });

  it('refuses without a referral consent on file or the patient agreeing today', async () => {
    const { service, audit, prisma } = setup();
    await expect(
      service.create(CLINIC, PATIENT, doctor, dto({ patientAgreedToday: undefined })),
    ).rejects.toMatchObject({ response: { code: 'REFERRAL_CONSENT_REQUIRED' } });
    expect(prisma.patientConsent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: CLINIC,
          patientId: PATIENT,
          consentType: 'REFERRAL_SHARING',
          status: 'GRANTED',
        },
      }),
    );
    expect(audit.logWrite).not.toHaveBeenCalled();
  });

  it('rests on the referral consent on file when there is one, and says so in the audit', async () => {
    const { service, audit } = setup({
      referralConsent: { id: 'consent-7', grantedAt: new Date('2026-11-01T09:00:00Z') },
    });
    await service.create(CLINIC, PATIENT, doctor, dto({ patientAgreedToday: undefined }));
    expect(JSON.parse(audit.logWrite.mock.calls[0][0].afterJson)).toMatchObject({
      consentBasis: 'RECORDED_CONSENT',
      consentId: 'consent-7',
      patientAgreedToday: false,
    });
  });

  it('emails the file with a cover note that names neither the patient nor anything clinical', async () => {
    const { service, email, audit } = setup();
    const result = await service.create(
      CLINIC,
      PATIENT,
      doctor,
      dto({
        delivery: 'EMAIL',
        recipientEmail: 'referrals@hospital.org',
        recipientName: 'Dr Mensah',
      }),
    );
    expect(result).toEqual({
      delivery: 'EMAIL',
      passcode: expect.any(String),
      sentTo: 'referrals@hospital.org',
    });

    const [to, subject, html, text, attachments] = email.send.mock.calls[0];
    expect(to).toBe('referrals@hospital.org');
    const message = `${subject}\n${html}\n${text}\n${attachments[0].filename}`;
    for (const secret of [
      'Yaa',
      'Asantewaa',
      'NKP-2026',
      'retinopathy',
      'Hypertensive',
      result.passcode,
    ]) {
      expect(message).not.toContain(secret);
    }
    expect(subject).toBe('Referral report from Bantama Clinic');
    expect(text).toMatch(/passcode/i);
    expect(attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');

    const after = JSON.parse(audit.logWrite.mock.calls[0][0].afterJson);
    expect(after.recipientEmailDomain).toBe('hospital.org');
    expect(JSON.stringify(after)).not.toContain('referrals@');
  });

  it('records nothing when the email fails', async () => {
    const { service, audit } = setup({ emailOk: false });
    await expect(
      service.create(
        CLINIC,
        PATIENT,
        doctor,
        dto({ delivery: 'EMAIL', recipientEmail: 'a@b.org' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'REFERRAL_EMAIL_FAILED' } });
    expect(audit.logWrite).not.toHaveBeenCalled();
  });

  it('refuses a section the sender may not read', async () => {
    const { service, audit } = setup();
    process.env.FEATURE_CLINICAL_NOTES_ENABLED = 'false';
    await expect(
      service.create(CLINIC, PATIENT, doctor, dto({ sections: ['SUMMARY', 'NOTES'] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    process.env.FEATURE_CLINICAL_NOTES_ENABLED = 'true';
    expect(audit.logWrite).not.toHaveBeenCalled();
  });

  it('gives a volunteer no prescriptions, which the app does not show them either', async () => {
    const { service, prisma } = setup();
    const { report } = await service.buildContent(CLINIC, PATIENT, volunteer, dto(), [
      'MEDICATIONS',
    ]);
    expect(prisma.prescription.findMany).not.toHaveBeenCalled();
    expect(report.sections[0].blocks.map((b) => (b.kind === 'table' ? b.caption : b.kind))).toEqual(
      ['Current medications'],
    );
    expect(report.sender.role).toBe('Clinical volunteer');
  });

  it('prints a near-empty record as short sentences, not empty tables', async () => {
    const { service } = setup();
    const { report } = await service.buildContent(CLINIC, PATIENT, doctor, dto(), [
      'SUMMARY',
      'READINGS',
      'MEDICATIONS',
      'ASSESSMENTS',
      'PLAN',
    ]);
    // The region stands in for a missing address; empty contact fields are skipped.
    expect(report.clinic.contact).toBe('Ashanti  ·  +233322000000');
    const readings = report.sections.find((s) => s.title === 'Readings')!;
    expect(readings.blocks).toEqual([
      {
        kind: 'paragraphs',
        items: [{ text: 'No blood pressure recorded. No glucose recorded. No HbA1c recorded.' }],
      },
    ]);
    const medications = report.sections.find((s) => s.title === 'Medications')!;
    expect(medications.blocks).toEqual([
      {
        kind: 'paragraphs',
        items: [
          {
            text: 'No current medications recorded. No prescriptions written at this clinic.',
          },
        ],
      },
    ]);
    expect(report.patient).toEqual(
      expect.arrayContaining([
        { label: 'National ID', value: 'Ending 4821' },
        { label: 'Residence', value: 'Digital Address AK-039-5028. Bantama, Ashanti' },
      ]),
    );
  });

  it('leaves signed notes out for a system admin without a clinical seat', () => {
    const { service } = setup();
    const admin = { userId: 'admin-1', roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }] };
    expect(service.allowedSections(CLINIC, admin)).not.toContain('NOTES');
    expect(service.allowedSections(CLINIC, doctor)).toContain('NOTES');
  });

  it('gives a manager everything they can read on the chart, which leaves out signed notes', () => {
    const { service } = setup();
    const manager = { userId: 'manager-1', roles: [{ clinicId: CLINIC, role: UserRole.MANAGER }] };
    expect(service.allowedSections(CLINIC, manager)).toEqual([
      'SUMMARY',
      'HISTORY',
      'READINGS',
      'MEDICATIONS',
      'ASSESSMENTS',
      'PLAN',
    ]);
  });

  it('counts age in whole years', () => {
    const dob = new Date('1961-02-03T00:00:00Z');
    expect(ageOn(dob, new Date('2026-02-02T12:00:00Z'))).toBe(64);
    expect(ageOn(dob, new Date('2026-02-03T12:00:00Z'))).toBe(65);
  });
});
