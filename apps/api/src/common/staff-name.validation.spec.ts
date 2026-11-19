import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStaffNameDto } from '../users/dto/staff-name.dto';
import { CreateStaffInviteDto } from '../staff-invites/dto/staff-invite.dto';

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateStaffNameDto, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors: Object.fromEntries(errors.map((e) => [e.property, e.constraints])) };
}

describe('staff name DTO validation', () => {
  it('normalizes the parts and keeps every middle name (#342)', async () => {
    const { dto, errors } = await check({
      firstName: '  Abena  Adɔma ',
      middleName: '  Kukua   Agyei-Boateng ',
      lastName: 'Kwame-Mensah',
    });

    expect(errors).toEqual({});
    expect(dto).toMatchObject({
      firstName: 'Abena Adɔma',
      middleName: 'Kukua Agyei-Boateng',
      lastName: 'Kwame-Mensah',
    });
  });

  it('treats a blank middle name as none', async () => {
    const { dto, errors } = await check({ firstName: 'Ama', middleName: ' ', lastName: 'Mensah' });

    expect(errors).toEqual({});
    expect(dto.middleName).toBeNull();
  });

  it('reads an older client’s middleInitial as the middle name', async () => {
    const { dto, errors } = await check({
      firstName: 'Ama',
      middleInitial: 'K',
      lastName: 'Mensah',
    });

    expect(errors).toEqual({});
    expect(dto.middleName).toBe('K');
  });

  it('prefers middleName when a client sends both', async () => {
    const { dto } = await check({
      firstName: 'Ama',
      middleName: 'Kukua',
      middleInitial: 'K',
      lastName: 'Mensah',
    });
    expect(dto.middleName).toBe('Kukua');
  });

  it('applies the alias to the invite form too', async () => {
    const dto = plainToInstance(CreateStaffInviteDto, {
      email: 'esi@clinic.org',
      role: 'VOLUNTEER',
      firstName: 'Esi',
      middleInitial: 'A',
      lastName: 'Owusu',
    });
    expect(dto.middleName).toBe('A');
  });

  it('explains each refusal in words the form can show', async () => {
    const { errors } = await check({
      firstName: '',
      middleName: 'Kwame 2',
      lastName: 'ama@x.org',
    });

    expect(Object.values(errors.firstName ?? {})).toEqual(['Enter your first name.']);
    expect(Object.values(errors.middleName ?? {})).toEqual([
      'Middle name(s) can only use letters, spaces, hyphens, apostrophes and periods.',
    ]);
    expect(Object.values(errors.lastName ?? {})).toEqual([
      'Last name can only use letters, spaces, hyphens, apostrophes and periods.',
    ]);
  });
});
