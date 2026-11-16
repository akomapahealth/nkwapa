import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePatientBodyDto } from './create-patient-body.dto';
import { ChangeNationalIdBodyDto } from './change-national-id.dto';
import { UpdatePatientBodyDto } from './update-patient-body.dto';

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

describe('patient middle names (#342)', () => {
  const body = { firstName: 'Nana', lastName: 'Tuffour', nationalIdType: 'NONE' };

  it('keeps every middle name, with extra spaces collapsed', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, { ...body, middleName: '  Kwame   Agyei ' });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.middleName).toBe('Kwame Agyei');
  });

  it('makes a blank middle name null, so an edit can clear it', async () => {
    expect(
      plainToInstance(CreatePatientBodyDto, { ...body, middleName: '  ' }).middleName,
    ).toBeNull();
    const update = plainToInstance(UpdatePatientBodyDto, { middleName: '' });
    expect(await validate(update, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(update.middleName).toBeNull();
  });

  it('leaves the middle name out of an edit that does not send it', () => {
    expect(plainToInstance(UpdatePatientBodyDto, { firstName: 'Nana' }).middleName).toBeUndefined();
  });

  it('accepts a 120-character middle name', async () => {
    const dto = plainToInstance(CreatePatientBodyDto, { ...body, middleName: 'A'.repeat(120) });
    expect(await validate(dto)).toEqual([]);
    expect(dto.middleName).toHaveLength(120);
  });
});
