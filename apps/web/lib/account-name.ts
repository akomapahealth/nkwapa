import {
  MIDDLE_INITIAL_MESSAGE,
  formatStaffDisplayName,
  middleInitialError,
  normalizeMiddleInitial,
  normalizeStaffNamePart,
  staffNameMessage,
  staffNamePartError,
} from '@nkwapa/db/staff-name';
import { ApiError, apiFetch, readApiError, type GetToken } from './api';

/** A staff name as the forms hold it: raw input, normalized on submit. */
export interface StaffNameInput {
  firstName: string;
  middleInitial: string;
  lastName: string;
}

export interface SavedStaffName {
  userId: string;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  displayName: string;
}

export type StaffNameField = keyof StaffNameInput;
export type StaffNameErrors = Partial<Record<StaffNameField, string>>;

/** Field order on screen, for focusing the first invalid one. */
export const STAFF_NAME_FIELDS: StaffNameField[] = ['firstName', 'middleInitial', 'lastName'];

export const EMPTY_STAFF_NAME: StaffNameInput = { firstName: '', middleInitial: '', lastName: '' };

export function toStaffNameInput(
  name: { firstName?: string | null; middleInitial?: string | null; lastName?: string | null } = {},
): StaffNameInput {
  return {
    firstName: name.firstName ?? '',
    middleInitial: name.middleInitial ?? '',
    lastName: name.lastName ?? '',
  };
}

/** "Ama K. Mensah" from whatever is typed so far, or null until both names are there. */
export function previewStaffName(value: StaffNameInput): string | null {
  const firstName = normalizeStaffNamePart(value.firstName);
  const lastName = normalizeStaffNamePart(value.lastName);
  if (!firstName || !lastName) return null;
  const initial = normalizeMiddleInitial(value.middleInitial);
  return formatStaffDisplayName({
    firstName,
    lastName,
    middleInitial: initial && !middleInitialError(initial) ? initial : null,
  });
}

/**
 * The same rules the API applies (both read @nkwapa/db), so the form says what is wrong before
 * a round trip. `optional` is the invite form, where the inviter may leave the name blank.
 */
export function validateStaffName(
  input: StaffNameInput,
  { email, optional = false }: { email?: string | null; optional?: boolean } = {},
): StaffNameErrors {
  const errors: StaffNameErrors = {};
  const firstName = normalizeStaffNamePart(input.firstName);
  const lastName = normalizeStaffNamePart(input.lastName);
  const middleInitial = normalizeMiddleInitial(input.middleInitial);

  if (middleInitialError(middleInitial)) errors.middleInitial = MIDDLE_INITIAL_MESSAGE;
  if (optional && !firstName && !lastName) {
    return errors;
  }
  const parts = [
    ['firstName', firstName, 'First name'],
    ['lastName', lastName, 'Last name'],
  ] as const;
  for (const [field, value, label] of parts) {
    const error = staffNamePartError(value, email);
    if (!error) continue;
    errors[field] =
      error === 'REQUIRED' && optional
        ? `Add a ${label.toLowerCase()} too, or leave both blank.`
        : staffNameMessage(error, label);
  }
  return errors;
}

/** The API's field errors, keyed for the form. */
export function staffNameErrorsFrom(error: unknown): StaffNameErrors {
  if (!(error instanceof ApiError)) return {};
  const errors: StaffNameErrors = {};
  for (const { field, message } of error.fieldErrors) {
    if ((STAFF_NAME_FIELDS as string[]).includes(field)) {
      errors[field as StaffNameField] ??= message;
    }
  }
  return errors;
}

function toBody(input: StaffNameInput) {
  return JSON.stringify({
    firstName: normalizeStaffNamePart(input.firstName),
    middleInitial: normalizeMiddleInitial(input.middleInitial),
    lastName: normalizeStaffNamePart(input.lastName),
  });
}

async function patchName(
  path: string,
  input: StaffNameInput,
  getToken: GetToken,
): Promise<SavedStaffName> {
  const response = await apiFetch(path, {
    method: 'PATCH',
    body: toBody(input),
    getToken,
    skipClinicHeader: true,
  });
  if (!response.ok) {
    throw await readApiError(response);
  }
  return (await response.json()) as SavedStaffName;
}

/** The signed-in person's own name. */
export function updateMyName(input: StaffNameInput, getToken: GetToken) {
  return patchName('/me/profile/name', input, getToken);
}

/** An admin correcting a staff member's name. */
export function updateUserName(userId: string, input: StaffNameInput, getToken: GetToken) {
  return patchName(`/admin/users/${encodeURIComponent(userId)}/name`, input, getToken);
}
