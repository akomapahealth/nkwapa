import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UNZONED_FILTER_VALUE } from '@nkwapa/db';
import { OrganizationAnalyticsQueryDto } from './organization-analytics-query.dto';

const parse = (plain: object) => plainToInstance(OrganizationAnalyticsQueryDto, plain);
const failedFields = async (plain: object) =>
  (await validate(parse(plain))).map((error) => error.property).sort();

describe('OrganizationAnalyticsQueryDto', () => {
  it('accepts no filters at all', async () => {
    expect(await failedFields({})).toEqual([]);
  });

  it('accepts every filter together', async () => {
    expect(
      await failedFields({
        from: '2026-09-01',
        to: '2026-09-30',
        clinicId: '6f1c0b52-6d2a-4c38-9a0e-2b5d6b0c7e11',
        zoneCode: UNZONED_FILTER_VALUE,
        workflow: 'HYPERTENSION',
        encounterStatus: 'FINALIZED',
        appointmentStatus: 'NO_SHOW',
      }),
    ).toEqual([]);
  });

  it('rejects malformed values', async () => {
    expect(
      await failedFields({
        from: '01/09/2026',
        to: '2026-9-1',
        clinicId: 'clinic-1',
        zoneCode: 'Greater Accra',
        workflow: 'CANCER',
        encounterStatus: 'SIGNED',
        appointmentStatus: 'LATE',
      }),
    ).toEqual([
      'appointmentStatus',
      'clinicId',
      'encounterStatus',
      'from',
      'to',
      'workflow',
      'zoneCode',
    ]);
  });
});
