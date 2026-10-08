import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUsersQueryDto } from './list-users.query.dto';
import { ListClinicsAdminQueryDto } from '../../clinics/dto/list-clinics-admin.query.dto';

async function errorsFor(cls: new () => object, query: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, query), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('admin list query parameters', () => {
  it.each([ListUsersQueryDto, ListClinicsAdminQueryDto])(
    '%p accepts an organization id',
    async (cls) => {
      expect(
        await errorsFor(cls, { organizationId: '4b1c7c2e-8b3f-4c2d-9a51-0f6f4e0b1a22' }),
      ).toEqual([]);
    },
  );

  // Anything that is not a UUID is refused before it reaches a query, never read as "all".
  it.each([ListUsersQueryDto, ListClinicsAdminQueryDto])(
    '%p refuses an organization id that is not a UUID',
    async (cls) => {
      for (const organizationId of ['all', '*', "' OR 1=1 --", '']) {
        expect(await errorsFor(cls, { organizationId })).toContain('organizationId');
      }
    },
  );

  it('still accepts the status filter it always took', async () => {
    expect(await errorsFor(ListUsersQueryDto, { status: 'inactive' })).toEqual([]);
  });
});
