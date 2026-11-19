import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePatientBodyDto } from './create-patient-body.dto';
import { UpdatePatientBodyDto } from './update-patient-body.dto';

const BASE_CREATE = {
  firstName: 'Ama',
  lastName: 'Mensah',
  nationalIdType: 'NATIONAL_ID',
  nationalId: 'GHA-123456789-0',
};

describe('residential location DTO validation', () => {
  it('accepts a fully recorded location and trims free-text fields', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, {
      ...BASE_CREATE,
      residentialLocationStatus: 'RECORDED',
      residentialRegion: 'GREATER_ACCRA',
      residentialDistrict: 'Accra Metropolitan',
      residentialCommunity: '  Osu  ',
      residentialAddressNote: '  Near the market  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.residentialCommunity).toBe('Osu');
    expect(dto.residentialAddressNote).toBe('Near the market');
  });

  it('accepts an omitted location (defaults handled by the service)', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, { ...BASE_CREATE });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.residentialRegion).toBeUndefined();
  });

  it('accepts a deliberate UNKNOWN status without granular fields', async () => {
    const dto = plainToInstance(UpdatePatientBodyDto, {
      residentialLocationStatus: 'UNKNOWN',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a district that does not belong to the region', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, {
      ...BASE_CREATE,
      residentialRegion: 'GREATER_ACCRA',
      residentialDistrict: 'Kumasi Metropolitan',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'residentialDistrict')).toBe(true);
  });

  it('rejects a district provided without a region', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, {
      ...BASE_CREATE,
      residentialDistrict: 'Accra Metropolitan',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'residentialDistrict')).toBe(true);
  });

  it('accepts a region without a district (partial input)', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, {
      ...BASE_CREATE,
      residentialRegion: 'ASHANTI',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an unknown region enum value', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, {
      ...BASE_CREATE,
      residentialRegion: 'ATLANTIS',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'residentialRegion')).toBe(true);
  });

  it('normalizes an over-length community down to the limit', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, {
      ...BASE_CREATE,
      residentialRegion: 'ASHANTI',
      residentialCommunity: 'x'.repeat(121),
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.residentialCommunity).toHaveLength(120);
  });

  it('truncates and preserves newlines in the address note', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, {
      ...BASE_CREATE,
      residentialAddressNote: `Line one\nLine two${' '.repeat(5)}`,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.residentialAddressNote).toBe('Line one\nLine two');
  });

  describe('Digital Address, landmark and map position (#343)', () => {
    const recorded = {
      ...BASE_CREATE,
      residentialLocationStatus: 'RECORDED',
      residentialRegion: 'GREATER_ACCRA',
    };

    it('stores ga1838164 hyphenated', async () => {
      const dto = plainToInstance(CreatePatientBodyDto, {
        ...recorded,
        residentialDigitalAddress: 'ga1838164',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
      expect(dto.residentialDigitalAddress).toBe('GA-183-8164');
    });

    it('refuses 12345 with a message that shows the expected shape', async () => {
      const dto = plainToInstance(CreatePatientBodyDto, {
        ...recorded,
        residentialDigitalAddress: '12345',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0].constraints ?? {}).join()).toContain('GA-183-8164');
    });

    it('accepts a region with only a landmark', async () => {
      const dto = plainToInstance(CreatePatientBodyDto, {
        ...recorded,
        residentialLandmark: '  Opposite the Methodist church  ',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
      expect(dto.residentialLandmark).toBe('Opposite the Methodist church');
    });

    it('refuses a position outside Ghana', async () => {
      const dto = plainToInstance(UpdatePatientBodyDto, {
        residentialLatitude: 51.5074,
        residentialLongitude: -0.1278,
      });
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toEqual(['residentialLatitude']);
    });

    it('accepts a device position with its accuracy and capture time', async () => {
      const dto = plainToInstance(UpdatePatientBodyDto, {
        residentialLatitude: 5.6037,
        residentialLongitude: -0.187,
        residentialPositionSource: 'DEVICE',
        residentialPositionAccuracyM: 12,
        residentialPositionCapturedAt: '2026-11-15T10:00:00.000Z',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('accepts nulls so an edit can clear the position', async () => {
      const dto = plainToInstance(UpdatePatientBodyDto, {
        residentialDigitalAddress: null,
        residentialLatitude: null,
        residentialLongitude: null,
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    });
  });
});
