import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePatientBodyDto } from './create-patient-body.dto';
import { ChangeNationalIdBodyDto } from './change-national-id.dto';

const errorsFor = async (cls: new () => object, body: object) =>
  (await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })).map(
    (e) => e.property,
  );

describe('national ID rules on the patient request bodies (#214)', () => {
  const patient = { firstName: 'Ama', lastName: 'Mensah' };

  it('lets a "No ID" registration leave the number out', async () => {
    expect(await errorsFor(CreatePatientBodyDto, { ...patient, nationalIdType: 'NONE' })).toEqual(
      [],
    );
  });

  it('still requires the number for every other ID type', async () => {
    expect(
      await errorsFor(CreatePatientBodyDto, { ...patient, nationalIdType: 'VOTER_ID' }),
    ).toEqual(['nationalId']);
    expect(
      await errorsFor(CreatePatientBodyDto, {
        ...patient,
        nationalIdType: 'PASSPORT',
        nationalId: '',
      }),
    ).toEqual(['nationalId']);
  });

  it('requires a reason for an ID change', async () => {
    expect(
      await errorsFor(ChangeNationalIdBodyDto, {
        nationalIdType: 'NATIONAL_ID',
        nationalId: 'GHA-1',
      }),
    ).toEqual(['reason']);
    expect(
      await errorsFor(ChangeNationalIdBodyDto, {
        nationalIdType: 'NONE',
        reason: 'No card after all',
      }),
    ).toEqual([]);
  });
});
