import { ApiError } from './api';
import { previewStaffName, staffNameErrorsFrom, validateStaffName } from './account-name';

const name = (firstName: string, lastName: string, middleName = '') => ({
  firstName,
  lastName,
  middleName,
});

describe('validateStaffName', () => {
  it('accepts diacritics, hyphens and apostrophes', () => {
    expect(validateStaffName(name('Abena Adɔma', "O'Neil-Mensah", "Kukua Agyei-O'Neil"))).toEqual(
      {},
    );
  });

  it('requires both names on the name step', () => {
    expect(validateStaffName(name('', ''))).toEqual({
      firstName: 'Enter your first name.',
      lastName: 'Enter your last name.',
    });
  });

  it('refuses digits and the email address, in any of the three names', () => {
    expect(validateStaffName(name('ama@x.org', '123', 'Kukua 2'), { email: 'ama@x.org' })).toEqual({
      firstName: 'First name can only use letters, spaces, hyphens, apostrophes and periods.',
      lastName: 'Last name can only use letters, spaces, hyphens, apostrophes and periods.',
      middleName: 'Middle name(s) can only use letters, spaces, hyphens, apostrophes and periods.',
    });
  });

  it('lets an inviter leave the name blank, but not half of it', () => {
    expect(validateStaffName(name('', ''), { optional: true })).toEqual({});
    expect(validateStaffName(name('Ama', ''), { optional: true })).toEqual({
      lastName: 'Add a last name too, or leave both blank.',
    });
  });
});

describe('staffNameErrorsFrom', () => {
  it('keys the API field errors for the form and ignores the rest', () => {
    const error = new ApiError('Check the name', {
      status: 400,
      fieldErrors: [
        { field: 'lastName', message: "Last name can't be your email address." },
        { field: 'email', message: 'ignored' },
      ],
    });
    expect(staffNameErrorsFrom(error)).toEqual({
      lastName: "Last name can't be your email address.",
    });
  });
});

describe('previewStaffName', () => {
  it('shows the display name once both names are there', () => {
    expect(previewStaffName(name('Ama', 'Mensah', '  Kukua   Agyei '))).toBe(
      'Ama Kukua Agyei Mensah',
    );
    // An initial kept from before #342 still reads as one.
    expect(previewStaffName(name('Ama', 'Mensah', 'K'))).toBe('Ama K. Mensah');
    expect(previewStaffName(name('Ama', ''))).toBeNull();
  });
});
