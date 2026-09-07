import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClinicAdminDto } from './create-clinic-admin.dto';
import { UpdateClinicAdminDto } from './update-clinic-admin.dto';

const BASE_CREATE = {
  name: 'Ridge Clinic',
  locationCode: 'ridge-clinic',
};

const failedFields = async (dto: object) =>
  (await validate(dto)).map((error) => error.property).sort();

describe('CreateClinicAdminDto', () => {
  it('accepts a fully specified clinic and normalizes what it stores', async () => {
    const dto = plainToInstance(CreateClinicAdminDto, {
      ...BASE_CREATE,
      region: '  Greater Accra  ',
      organizationId: '11111111-1111-4111-8111-111111111111',
      timezone: 'Africa/Accra',
      countryCode: 'gh',
      zoneCode: '  Greater-Accra  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.region).toBe('Greater Accra');
    expect(dto.countryCode).toBe('GH');
    expect(dto.zoneCode).toBe('greater-accra');
  });

  it('accepts a clinic carrying nothing but a name and a location code', async () => {
    await expect(
      validate(plainToInstance(CreateClinicAdminDto, BASE_CREATE)),
    ).resolves.toHaveLength(0);
  });

  it('rejects a missing location code', async () => {
    expect(
      await failedFields(plainToInstance(CreateClinicAdminDto, { name: 'Ridge Clinic' })),
    ).toEqual(['locationCode']);
  });

  it('rejects a blank location code', async () => {
    expect(
      await failedFields(
        plainToInstance(CreateClinicAdminDto, { ...BASE_CREATE, locationCode: '   ' }),
      ),
    ).toEqual(['locationCode']);
  });

  it('accepts a location code that only differs by case or padding', async () => {
    const dto = plainToInstance(CreateClinicAdminDto, {
      ...BASE_CREATE,
      locationCode: '  Ridge-Clinic  ',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.locationCode).toBe('ridge-clinic');
  });

  it('rejects an invalid timezone', async () => {
    expect(
      await failedFields(
        plainToInstance(CreateClinicAdminDto, { ...BASE_CREATE, timezone: 'Africa/Akra' }),
      ),
    ).toEqual(['timezone']);
  });

  it('rejects a fixed UTC offset as a timezone', async () => {
    expect(
      await failedFields(
        plainToInstance(CreateClinicAdminDto, { ...BASE_CREATE, timezone: '+05:00' }),
      ),
    ).toEqual(['timezone']);
  });

  it('rejects an organization id that is not a UUID', async () => {
    expect(
      await failedFields(
        plainToInstance(CreateClinicAdminDto, { ...BASE_CREATE, organizationId: 'default' }),
      ),
    ).toEqual(['organizationId']);
  });

  it('treats an omitted zone code as absent, since the field is optional', async () => {
    const dto = plainToInstance(CreateClinicAdminDto, BASE_CREATE);
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.zoneCode).toBeUndefined();
  });

  it('collapses a blank zone code to null rather than storing an empty string', async () => {
    const dto = plainToInstance(CreateClinicAdminDto, { ...BASE_CREATE, zoneCode: '   ' });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.zoneCode).toBeNull();
  });

  it('rejects a malformed zone code', async () => {
    expect(
      await failedFields(
        plainToInstance(CreateClinicAdminDto, { ...BASE_CREATE, zoneCode: 'Greater Accra' }),
      ),
    ).toEqual(['zoneCode']);
  });

  it('rejects a country code that is not two letters', async () => {
    expect(
      await failedFields(
        plainToInstance(CreateClinicAdminDto, { ...BASE_CREATE, countryCode: 'ghana' }),
      ),
    ).toEqual(['countryCode']);
  });

  it('reports every bad field at once, so one correction pass fixes the form', async () => {
    expect(
      await failedFields(
        plainToInstance(CreateClinicAdminDto, {
          name: 'Ridge Clinic',
          locationCode: 'Ridge Clinic',
          timezone: 'Africa/Akra',
          countryCode: 'g',
        }),
      ),
    ).toEqual(['countryCode', 'locationCode', 'timezone']);
  });
});

describe('UpdateClinicAdminDto', () => {
  it('accepts an empty body, since every field is optional on update', async () => {
    await expect(validate(plainToInstance(UpdateClinicAdminDto, {}))).resolves.toHaveLength(0);
  });

  it('accepts a deactivation on its own', async () => {
    const dto = plainToInstance(UpdateClinicAdminDto, { isActive: false });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.isActive).toBe(false);
  });

  it('still rejects a blank location code, which would leave a clinic unidentifiable', async () => {
    expect(
      await failedFields(plainToInstance(UpdateClinicAdminDto, { locationCode: '   ' })),
    ).toEqual(['locationCode']);
  });

  it('still rejects an invalid timezone', async () => {
    expect(
      await failedFields(plainToInstance(UpdateClinicAdminDto, { timezone: 'Mars/Olympus' })),
    ).toEqual(['timezone']);
  });

  it('lets a zone code be cleared explicitly', async () => {
    const dto = plainToInstance(UpdateClinicAdminDto, { zoneCode: '' });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.zoneCode).toBeNull();
  });
});
