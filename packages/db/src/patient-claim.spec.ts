import {
  CLAIM_REFUSAL_CODES,
  CLAIM_REFUSAL_LABELS,
  CLAIM_REFUSAL_RECOVERY,
  claimRefusal,
  expiredInviteRefusal,
} from './patient-claim';

/*
  The claim refusals, as a patient meets them.

  This is the one identity workflow nobody walks a patient through. There is no staff member
  beside them to translate, so a refusal that does not say what to do next ends with the person
  either giving up on the portal or phoning a clinic that cannot see what they saw.
*/
describe('portal claim refusals', () => {
  it.each(CLAIM_REFUSAL_CODES)('%s says what happened and what to do next', (code) => {
    expect(CLAIM_REFUSAL_LABELS[code]).toBeTruthy();
    expect(CLAIM_REFUSAL_RECOVERY[code]).toBeTruthy();
  });

  it('never shows a patient a system word', () => {
    for (const code of CLAIM_REFUSAL_CODES) {
      expect(CLAIM_REFUSAL_LABELS[code]).not.toMatch(/_|invite\b|Prisma|null|undefined/);
      expect(CLAIM_REFUSAL_RECOVERY[code]).not.toMatch(/_|Prisma|null|undefined/);
    }
  });

  // "Try again" is the one recovery none of these states deserves: not one of them changes on a
  // retry, so offering it sends the patient round the same loop.
  it('never answers a permanent refusal with "try again" alone', () => {
    for (const code of CLAIM_REFUSAL_CODES) {
      expect(CLAIM_REFUSAL_RECOVERY[code].toLowerCase()).not.toBe('try again.');
      expect(CLAIM_REFUSAL_RECOVERY[code].length).toBeGreaterThan(25);
    }
  });

  it('builds a refusal from the tables rather than from a call site', () => {
    expect(claimRefusal('INVITE_CANCELLED')).toEqual({
      code: 'INVITE_CANCELLED',
      message: CLAIM_REFUSAL_LABELS.INVITE_CANCELLED,
      recoveryAction: CLAIM_REFUSAL_RECOVERY.INVITE_CANCELLED,
    });
  });

  it('adds a detail as a second sentence, not as a replacement for the recovery', () => {
    const refusal = claimRefusal('RECORD_MERGED', 'Its history now lives on another record.');

    expect(refusal.message).toBe(
      'This record has been combined into another one. Its history now lives on another record.',
    );
    expect(refusal.recoveryAction).toBe(CLAIM_REFUSAL_RECOVERY.RECORD_MERGED);
  });

  /*
    "It expired" and "it expired three months ago" lead a patient to different conclusions about
    whether the clinic already knows, so the date replaces the generic wording rather than being
    bolted onto it.
  */
  it('names the date an invitation lapsed when one is known', () => {
    expect(expiredInviteRefusal('3 March 2026').message).toBe(
      'This invitation expired on 3 March 2026.',
    );
  });

  // An invitation with no expiry instant is not expired at all; the undated refusal is for a row
  // the scheduled sweep has already settled to EXPIRED.
  it('keeps an undated wording for an invitation a sweep already settled', () => {
    expect(claimRefusal('INVITE_EXPIRED').message).toBe(CLAIM_REFUSAL_LABELS.INVITE_EXPIRED);
  });

  /*
    A refusal must not tell someone holding a stolen invitation anything they did not already
    have. The contact mismatch says an address does not match; it never names the address the
    clinic staged.
  */
  it('does not name the contact details the clinic staged', () => {
    expect(CLAIM_REFUSAL_LABELS.CONTACT_MISMATCH).not.toMatch(/@/);
    expect(CLAIM_REFUSAL_LABELS.CONTACT_MISMATCH).not.toMatch(/\+\d/);
  });
});
