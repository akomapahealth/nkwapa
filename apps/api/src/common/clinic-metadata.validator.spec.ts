import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UNZONED_FILTER_VALUE } from '@nkwapa/db';
import {
  IsCountryCode,
  IsIanaTimeZone,
  IsLocationCode,
  IsZoneCode,
  IsZoneFilter,
} from './clinic-metadata.validator';

class MetadataProbe {
  @IsIanaTimeZone()
  timezone!: string;

  @IsLocationCode()
  locationCode!: string;

  @IsZoneCode()
  zoneCode?: string | null;

  @IsCountryCode()
  countryCode!: string;
}

const valid = {
  timezone: 'Africa/Accra',
  locationCode: 'nkwapa-clinic-demo',
  zoneCode: 'greater-accra',
  countryCode: 'GH',
};

async function failingFields(overrides: Partial<MetadataProbe>) {
  const errors = await validate(plainToInstance(MetadataProbe, { ...valid, ...overrides }));
  return errors.map((error) => error.property);
}

describe('clinic metadata validators', () => {
  it('accepts fully valid metadata', async () => {
    expect(await failingFields({})).toEqual([]);
  });

  describe('IsIanaTimeZone', () => {
    it('rejects a zone that does not exist', async () => {
      expect(await failingFields({ timezone: 'Africa/Akra' })).toEqual(['timezone']);
    });

    it('rejects a bare offset, which has no daylight-saving rules', async () => {
      expect(await failingFields({ timezone: '+05:00' })).toEqual(['timezone']);
    });

    it('rejects an empty or non-string zone', async () => {
      expect(await failingFields({ timezone: '' })).toEqual(['timezone']);
      expect(await failingFields({ timezone: undefined })).toEqual(['timezone']);
    });

    it('accepts a deprecated alias, since it still resolves to a real zone', async () => {
      expect(await failingFields({ timezone: 'US/Eastern' })).toEqual([]);
    });

    it('explains that an offset is not accepted', async () => {
      const [error] = await validate(
        plainToInstance(MetadataProbe, { ...valid, timezone: '+05:00' }),
      );
      expect(Object.values(error.constraints ?? {}).join(' ')).toContain('Africa/Accra');
    });
  });

  describe('IsLocationCode', () => {
    it('rejects a missing code, which is what create must refuse', async () => {
      expect(await failingFields({ locationCode: '' })).toEqual(['locationCode']);
      expect(await failingFields({ locationCode: undefined })).toEqual(['locationCode']);
    });

    it('rejects codes that are not slug-shaped', async () => {
      expect(await failingFields({ locationCode: 'Ridge Clinic' })).toEqual(['locationCode']);
      expect(await failingFields({ locationCode: 'ridge_clinic' })).toEqual(['locationCode']);
      expect(await failingFields({ locationCode: '-ridge' })).toEqual(['locationCode']);
    });

    it('rejects a code wider than the column', async () => {
      expect(await failingFields({ locationCode: 'a'.repeat(65) })).toEqual(['locationCode']);
    });
  });

  describe('IsZoneCode', () => {
    it('treats an absent zone code as valid, because the field is optional', async () => {
      expect(await failingFields({ zoneCode: undefined })).toEqual([]);
      expect(await failingFields({ zoneCode: null })).toEqual([]);
      expect(await failingFields({ zoneCode: '' })).toEqual([]);
    });

    it('still shape-checks a zone code that is present', async () => {
      expect(await failingFields({ zoneCode: 'Greater Accra' })).toEqual(['zoneCode']);
    });
  });

  describe('IsZoneFilter', () => {
    class ZoneFilterSubject {
      @IsZoneFilter()
      zoneCode?: string;
    }

    const filterErrors = async (value: unknown) => {
      const subject = new ZoneFilterSubject();
      (subject as { zoneCode?: unknown }).zoneCode = value;
      return (await validate(subject)).map((error) => error.property);
    };

    it('accepts a zone code, like IsZoneCode does', async () => {
      expect(await filterErrors('greater-accra')).toEqual([]);
    });

    it('accepts the unzoned sentinel, which IsZoneCode does not', async () => {
      // This is the whole reason the two decorators are separate: `__unzoned__` is a legal
      // question to ask a query and an illegal value to store in the column.
      expect(await filterErrors(UNZONED_FILTER_VALUE)).toEqual([]);
      expect(await failingFields({ zoneCode: UNZONED_FILTER_VALUE })).toEqual(['zoneCode']);
    });

    it('treats absent and empty as no filter', async () => {
      expect(await filterErrors(undefined)).toEqual([]);
      expect(await filterErrors('')).toEqual([]);
    });

    it('rejects a value the column could not hold', async () => {
      expect(await filterErrors('Greater Accra')).toEqual(['zoneCode']);
      expect(await filterErrors('a'.repeat(65))).toEqual(['zoneCode']);
      expect(await filterErrors(7)).toEqual(['zoneCode']);
    });
  });

  describe('IsCountryCode', () => {
    it('rejects anything that is not two letters', async () => {
      expect(await failingFields({ countryCode: 'G' })).toEqual(['countryCode']);
      expect(await failingFields({ countryCode: 'GHA' })).toEqual(['countryCode']);
      expect(await failingFields({ countryCode: '' })).toEqual(['countryCode']);
    });

    it('accepts lowercase, since the value is normalized before storage', async () => {
      expect(await failingFields({ countryCode: 'gh' })).toEqual([]);
    });
  });

  it('reports every bad field at once rather than stopping at the first', async () => {
    expect(
      (
        await failingFields({
          timezone: 'Africa/Akra',
          locationCode: 'Ridge Clinic',
          countryCode: 'ghana',
        })
      ).sort(),
    ).toEqual(['countryCode', 'locationCode', 'timezone']);
  });
});
