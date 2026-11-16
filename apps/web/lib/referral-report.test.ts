import {
  defaultReferralSections,
  groupPasscode,
  pdfBlobFromBase64,
  referralShareSummary,
} from './referral-report';

describe('referral report sheet (#344)', () => {
  it('ticks everything allowed except signed notes', () => {
    expect(defaultReferralSections(['SUMMARY', 'READINGS', 'NOTES'])).toEqual([
      'SUMMARY',
      'READINGS',
    ]);
  });

  it('says plainly what is shared and where it goes', () => {
    expect(
      referralShareSummary({
        patientName: 'Yaa Asantewaa',
        sections: ['SUMMARY', 'READINGS'],
        delivery: 'EMAIL',
        recipientEmail: ' eye@kath.org ',
        facility: 'KATH Eye Clinic',
      }),
    ).toBe(
      'Yaa Asantewaa’s name, patient code, date of birth, phone and residence, at a glance and readings, emailed to eye@kath.org for KATH Eye Clinic, locked with a passcode.',
    );
    expect(
      referralShareSummary({
        patientName: 'Kofi',
        sections: [],
        delivery: 'DOWNLOAD',
        recipientEmail: '',
        facility: '',
      }),
    ).toBe(
      'Kofi’s name, patient code, date of birth, phone and residence, downloaded to this device, locked with a passcode.',
    );
  });

  it('groups the passcode in fours for reading aloud', () => {
    expect(groupPasscode('K7QMXR4P')).toBe('K7QM XR4P');
  });

  it('turns the API’s base64 into a PDF blob', async () => {
    const blob = pdfBlobFromBase64(Buffer.from('%PDF-1.7').toString('base64'));
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(8);
  });
});
