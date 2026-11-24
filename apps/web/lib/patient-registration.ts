import { normalizeMiddleName } from './person-name';

export type NationalIdType = 'VOTER_ID' | 'NATIONAL_ID' | 'PASSPORT' | 'OTHER' | 'NONE';

/** The registration form as typed. The ID type starts unchosen (#428). */
export interface RegistrationForm {
  firstName: string;
  middleName: string;
  lastName: string;
  dob?: string;
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  phoneE164?: string;
  email?: string;
  nationalIdType: NationalIdType | '';
  nationalId: string;
}

export const CHOOSE_ID_TYPE_MESSAGE =
  'Choose the document the patient showed, or tick No ID with them today.';

/**
 * The create-patient body, or the reason it cannot be sent yet. A number with no type is never
 * guessed as "Other": volunteers accepted that default and made up numbers (#428).
 */
export function registrationBody(
  form: RegistrationForm,
): { error: string } | { body: Record<string, unknown> } {
  if (!form.nationalIdType) return { error: CHOOSE_ID_TYPE_MESSAGE };
  const noId = form.nationalIdType === 'NONE';
  return {
    body: {
      ...form,
      // A patient with no ID document has no number to send (#214).
      nationalId: noId ? undefined : form.nationalId,
      middleName: normalizeMiddleName(form.middleName) ?? undefined,
      dob: form.dob || undefined,
      sex: form.sex ?? 'UNKNOWN',
      phoneE164: form.phoneE164 || undefined,
      email: form.email || undefined,
    },
  };
}
