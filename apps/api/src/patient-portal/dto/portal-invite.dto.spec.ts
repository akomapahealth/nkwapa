import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePatientPortalInviteDto } from './portal-invite.dto';

describe('CreatePatientPortalInviteDto', () => {
  it('normalizes and accepts a normal invite email', async () => {
    const dto = plainToInstance(CreatePatientPortalInviteDto, {
      email: '  Ama.Patient@Nkwapa.Health  ',
    });

    const errors = await validate(dto);

    expect(dto.email).toBe('ama.patient@nkwapa.health');
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['malformed email', 'not-an-email'],
    ['reserved domain', 'patient@example.com'],
    ['localhost domain', 'patient@mail.localhost'],
    ['ip-literal domain', 'patient@[192.0.2.1]'],
    ['disposable domain', 'patient@mailinator.com'],
  ])('rejects %s', async (_label, email) => {
    const dto = plainToInstance(CreatePatientPortalInviteDto, { email });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('email');
  });

  it.each([7, 14, 30])('accepts a %i-day lifetime', async (ttlDays) => {
    const dto = plainToInstance(CreatePatientPortalInviteDto, {
      email: 'ama.patient@nkwapa.health',
      ttlDays,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.ttlDays).toBe(ttlDays);
  });

  // A query string or a form post arrives as text. Without the transform this validates
  // as a string against a numeric list and every invite from such a caller is rejected.
  it('coerces a numeric string lifetime', async () => {
    const dto = plainToInstance(CreatePatientPortalInviteDto, {
      email: 'ama.patient@nkwapa.health',
      ttlDays: '14',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.ttlDays).toBe(14);
  });

  // A free-form lifetime is how a six-month invite gets issued by accident.
  it.each([0, 1, 365, -7])('rejects a %i-day lifetime', async (ttlDays) => {
    const dto = plainToInstance(CreatePatientPortalInviteDto, {
      email: 'ama.patient@nkwapa.health',
      ttlDays,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('ttlDays');
  });

  it('leaves the lifetime to the server when none is given', async () => {
    const dto = plainToInstance(CreatePatientPortalInviteDto, {
      email: 'ama.patient@nkwapa.health',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.ttlDays).toBeUndefined();
  });
});
