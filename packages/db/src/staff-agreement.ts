/**
 * The confidentiality agreement staff sign before working with patient records (#330).
 *
 * Shared by the API and the web app so the text a person reads is the text the server hashes
 * into their signature. Changing any wording here means bumping `version`, which asks everyone
 * to sign again; a signature is only ever for the exact text it was given against.
 */

export interface StaffAgreementSection {
  title: string;
  body: string;
}

export const STAFF_AGREEMENT = {
  key: 'STAFF_CONFIDENTIALITY',
  version: 1,
  title: 'Confidentiality agreement',
  intro:
    'Nkwapa holds the health records of real patients. Before you use it, read the points below and sign to confirm you will follow them.',
  sections: [
    {
      title: 'Patient information is confidential',
      body: 'Everything you see in Nkwapa about a patient stays inside Akomapa. Do not discuss it with anyone outside the Akomapa care team, including family, friends and classmates, and do not post about it anywhere.',
    },
    {
      title: 'Only open what you need',
      body: "Look at a patient's record only when you are helping care for that patient. Do not look up people you know, and do not browse.",
    },
    {
      title: 'Nothing leaves Nkwapa',
      body: 'Do not take screenshots or photos of the screen. Do not download, export or copy patient details into notes, messaging apps, email or personal devices.',
    },
    {
      title: 'Record truthfully',
      body: 'Enter what you measured and observed. Never change, delete or backdate an entry to hide a mistake. If you got something wrong, correct it openly and tell your supervisor.',
    },
    {
      title: 'Your account is yours alone',
      body: 'Do not share your password or let anyone else use your sign-in. Lock the device or sign out when you step away.',
    },
    {
      title: 'Everything is logged',
      body: 'Nkwapa records who viewed and changed each record, under your name.',
    },
    {
      title: 'Report problems the same day',
      body: 'If a device is lost, if you think information has leaked, or if you saw something you should not have, tell your clinic lead or a system administrator the same day.',
    },
    {
      title: 'This continues after you leave',
      body: 'Your duty to keep patient information confidential does not end when your volunteering or your account does.',
    },
    {
      title: 'If this agreement is broken',
      body: 'Breaking this agreement can mean losing access, removal from the programme, a report to your school or professional body, and action under the data protection laws of Ghana.',
    },
  ] as StaffAgreementSection[],
} as const;

/**
 * Roles that cannot work until they have signed. Holding one at any clinic is enough: the
 * agreement is with the person, not per clinic. Add MANAGER and DOCTOR here to extend it.
 */
export const AGREEMENT_REQUIRED_ROLES: readonly string[] = ['VOLUNTEER'];

/** Whether someone with these roles, who last signed `signedVersion`, must sign before working. */
export function requiresStaffAgreement(
  roles: readonly string[],
  signedVersion: number | null | undefined,
): boolean {
  if (!roles.some((role) => AGREEMENT_REQUIRED_ROLES.includes(role))) return false;
  return (signedVersion ?? 0) < STAFF_AGREEMENT.version;
}

/** The exact text a signature covers, for hashing. */
export function staffAgreementText(): string {
  return JSON.stringify(STAFF_AGREEMENT);
}

const fold = (value: string | null | undefined) =>
  (value ?? '').normalize('NFC').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

/**
 * Whether a typed signature is this person's name: first and last name, with or without the
 * middle names, ignoring case, periods and extra spaces. A stored initial ("K") matches "K." too.
 */
export function signatureMatchesName(
  typed: string,
  name: { firstName?: string | null; middleName?: string | null; lastName?: string | null },
): boolean {
  const first = fold(name.firstName);
  const last = fold(name.lastName);
  if (!first || !last) return false;
  const signed = fold(typed);
  const middle = fold(name.middleName);
  return signed === `${first} ${last}` || (!!middle && signed === `${first} ${middle} ${last}`);
}
