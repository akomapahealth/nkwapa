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
});
