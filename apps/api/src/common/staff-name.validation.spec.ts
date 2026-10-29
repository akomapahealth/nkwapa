import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStaffNameDto } from '../users/dto/staff-name.dto';

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateStaffNameDto, body);
  const errors = await validate(dto);
  return { dto, errors: Object.fromEntries(errors.map((e) => [e.property, e.constraints])) };
}

describe('staff name DTO validation', () => {
  it('normalizes the parts and the middle initial', async () => {
    const { dto, errors } = await check({
      firstName: '  Abena  Adɔma ',
      middleInitial: 'k.',
      lastName: 'Kwame-Mensah',
    });

    expect(errors).toEqual({});
    expect(dto).toMatchObject({
      firstName: 'Abena Adɔma',
      middleInitial: 'K',
      lastName: 'Kwame-Mensah',
    });
  });

  it('treats a blank middle initial as none', async () => {
    const { dto, errors } = await check({
      firstName: 'Ama',
      middleInitial: ' ',
      lastName: 'Mensah',
    });

    expect(errors).toEqual({});
    expect(dto.middleInitial).toBeNull();
  });

  it('explains each refusal in words the form can show', async () => {
    const { errors } = await check({ firstName: '', middleInitial: 'KM', lastName: 'ama@x.org' });

    expect(Object.values(errors.firstName ?? {})).toEqual(['Enter your first name.']);
    expect(Object.values(errors.middleInitial ?? {})).toEqual([
      'Middle initial must be a single letter.',
    ]);
    expect(Object.values(errors.lastName ?? {})).toEqual([
      'Last name can only use letters, spaces, hyphens, apostrophes and periods.',
    ]);
  });
});
