import { UserRole } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../auth/constants/permissions';
import {
  PASSCODE_ALPHABET,
  PASSCODE_LENGTH,
  allowedReferralSections,
  generatePasscode,
  resolveReferralSections,
} from './referral-report-sections';

const ALL_FLAGS = ['medicalHistory', 'medicationReconciliation', 'clinicalNotes'] as const;

describe('referral report sections (#344)', () => {
  it('gives doctors and volunteers every section when the features are on', () => {
    for (const role of [UserRole.DOCTOR, UserRole.VOLUNTEER]) {
      expect(allowedReferralSections(ROLE_PERMISSIONS[role], ALL_FLAGS)).toEqual([
        'SUMMARY',
        'HISTORY',
        'READINGS',
        'MEDICATIONS',
        'ASSESSMENTS',
        'PLAN',
        'NOTES',
      ]);
    }
  });

  it('drops a section whose feature is off', () => {
    expect(allowedReferralSections(ROLE_PERMISSIONS.DOCTOR, [])).toEqual([
      'SUMMARY',
      'READINGS',
      'ASSESSMENTS',
      'PLAN',
    ]);
  });

  it('gives a patient nothing', () => {
    expect(allowedReferralSections(ROLE_PERMISSIONS.PATIENT, ALL_FLAGS)).toEqual([]);
  });

  it('leaves signed notes out unless they are asked for', () => {
    const allowed = allowedReferralSections(ROLE_PERMISSIONS.DOCTOR, ALL_FLAGS);
    expect(resolveReferralSections(undefined, allowed).sections).not.toContain('NOTES');
    expect(resolveReferralSections(['NOTES', 'SUMMARY'], allowed)).toEqual({
      sections: ['SUMMARY', 'NOTES'],
      refused: [],
    });
  });

  it('refuses a section the sender cannot read rather than dropping it quietly', () => {
    const allowed = allowedReferralSections(ROLE_PERMISSIONS.DOCTOR, []);
    expect(resolveReferralSections(['SUMMARY', 'NOTES'], allowed)).toEqual({
      sections: ['SUMMARY'],
      refused: ['NOTES'],
    });
  });

  it('makes 16-character passcodes with no easily confused characters', () => {
    expect(PASSCODE_ALPHABET).not.toMatch(/[0O1IL]/);
    const codes = Array.from({ length: 500 }, generatePasscode);
    for (const code of codes) {
      expect(code).toHaveLength(PASSCODE_LENGTH);
      expect([...code].every((char) => PASSCODE_ALPHABET.includes(char))).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});
