import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UNZONED_FILTER_VALUE } from '@nkwapa/db';
import { ListClinicsAdminQueryDto } from './list-clinics-admin.query.dto';

const parse = (plain: object) => plainToInstance(ListClinicsAdminQueryDto, plain);
const failedFields = async (dto: object) =>
  (await validate(dto)).map((error) => error.property).sort();

describe('ListClinicsAdminQueryDto', () => {
  it('accepts no query at all', async () => {
    await expect(validate(parse({}))).resolves.toHaveLength(0);
  });

  it('accepts a zone code', async () => {
    const dto = parse({ zoneCode: 'greater-accra' });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.zoneCode).toBe('greater-accra');
  });

  it('accepts the unzoned sentinel', async () => {
    // The one value that is not a legal zone code but is a legal filter. If sanitization ever
    // started stripping underscores this is the test that would notice.
    const dto = parse({ zoneCode: UNZONED_FILTER_VALUE });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.zoneCode).toBe(UNZONED_FILTER_VALUE);
  });

  it('accepts an empty zone code as no filter', async () => {
    await expect(validate(parse({ zoneCode: '' }))).resolves.toHaveLength(0);
  });

  it('rejects a zone code the column could not hold', async () => {
    expect(await failedFields(parse({ zoneCode: 'Greater Accra' }))).toEqual(['zoneCode']);
    expect(await failedFields(parse({ zoneCode: '-leading' }))).toEqual(['zoneCode']);
    expect(await failedFields(parse({ zoneCode: 'a'.repeat(65) }))).toEqual(['zoneCode']);
  });

  it('explains the sentinel in the message, since nothing else would', () => {
    return validate(parse({ zoneCode: 'not a zone' })).then((errors) => {
      const message = Object.values(errors[0].constraints ?? {}).join(' ');
      expect(message).toContain(UNZONED_FILTER_VALUE);
    });
  });
});
