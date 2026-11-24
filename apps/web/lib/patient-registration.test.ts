import {
  CHOOSE_ID_TYPE_MESSAGE,
  registrationBody,
  type RegistrationForm,
} from './patient-registration';

const form: RegistrationForm = {
  firstName: 'Ama',
  middleName: '',
  lastName: 'Mensah',
  nationalIdType: '',
  nationalId: '',
};

describe('registrationBody (#428)', () => {
  it('sends no number when the patient has no ID with them', () => {
    // A number typed before ticking No ID must not leak into the chart.
    const result = registrationBody({ ...form, nationalIdType: 'NONE', nationalId: '0001' });
    expect(result).toEqual({
      body: expect.objectContaining({ nationalIdType: 'NONE', nationalId: undefined }),
    });
  });

  it('refuses a number with no document type rather than guessing Other', () => {
    expect(registrationBody({ ...form, nationalId: 'GHA-123' })).toEqual({
      error: CHOOSE_ID_TYPE_MESSAGE,
    });
  });

  it('sends the chosen type with its number', () => {
    expect(registrationBody({ ...form, nationalIdType: 'VOTER_ID', nationalId: '123' })).toEqual({
      body: expect.objectContaining({
        nationalIdType: 'VOTER_ID',
        nationalId: '123',
        sex: 'UNKNOWN',
      }),
    });
  });
});
