import { UpsertCounsellingDto } from '../counselling/dto/counselling.dto';
import { UpsertDiabetesScreeningDto } from '../diabetes-screening/dto/diabetes-screening.dto';
import { UpsertEyeScreeningDto } from '../eye-screening/dto/eye-screening.dto';
import { UpsertHypertensionAssessmentDto } from '../hypertension-assessment/dto/hypertension-assessment.dto';
import { CreateMedicalHistoryDto } from '../medical-history/dto/medical-history.dto';
import { CreatePatientMedicationDto } from '../medication-reconciliation/dto/medication-reconciliation.dto';
import type { PrismaService } from '../prisma/prisma.service';
import { ClinicalMeasurementsService } from '../sync/clinical-measurements.service';
import { parseCsv } from './csv';
import { compareDerivations } from './derivations';
import { validateDto } from './importer';
import { acuity, answer, flag, ID_TYPE, label, UnknownLabelError } from './labels';
import { atTime, importId, mapPatient, parseDate, RowRejectedError, splitList } from './map-row';
import { joinTabs, tabFromCsv, TABS } from './read-sheet';
import { fullVisit, sheetPatient } from './testing';

const DATE = '2026-10-10';

describe('parseCsv', () => {
  it('reads quoted commas, quotes and newlines the way Sheets writes them', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,,z')).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['x', '', 'z'],
    ]);
  });

  it('drops a byte-order mark and tolerates a trailing newline', () => {
    expect(parseCsv('﻿Visit ID,Arrived\nV-001,08:00\n')).toEqual([
      ['Visit ID', 'Arrived'],
      ['V-001', '08:00'],
    ]);
  });

  it('refuses a file that ends inside a quote', () => {
    expect(() => parseCsv('a,"open')).toThrow('quoted field');
  });
});

describe('reading the sheet', () => {
  const csvLine = (cells: readonly string[]) =>
    cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
  const header = csvLine(TABS.checkIn.headers);

  it('refuses a tab whose columns moved', () => {
    const moved = [...TABS.checkIn.headers];
    [moved[2], moved[3]] = [moved[3], moved[2]];
    expect(() => tabFromCsv('checkIn', `${csvLine(moved)}\n`)).toThrow(
      'not the ones the sheet was built with',
    );
  });

  it('skips unused pre-numbered rows and reports station data with no patient', () => {
    const checkIn = tabFromCsv('checkIn', `${header}\nV-001,08:00,Ama,Mensah\nV-002\nV-003\n`);
    const bp = tabFromCsv('bp', `${csvLine(TABS.bp.headers)}\nV-003,,120,80\n`);
    const empty = (key: keyof typeof TABS) => tabFromCsv(key, `${csvLine(TABS[key].headers)}\n`);
    const loaded = joinTabs({
      checkIn,
      intake: empty('intake'),
      bp,
      glucose: empty('glucose'),
      body: empty('body'),
      eye: empty('eye'),
      review: empty('review'),
    });
    expect(loaded.patients.map((p) => p.visitId)).toEqual(['V-001']);
    expect(loaded.orphans).toEqual([{ visitId: 'V-003', tabs: ['2 Blood Pressure'] }]);
  });
});

describe('labels', () => {
  it('ignores case and spacing, never the words', () => {
    expect(label(ID_TYPE, 'ID type', '  ghana   CARD ')).toBe('NATIONAL_ID');
  });

  it('reads yes/no cells the way volunteers filled them', () => {
    expect(answer('Normal')).toEqual({ value: false, note: null });
    expect(answer('Yes, during the night')).toEqual({ value: true, note: 'Yes, during the night' });
    expect(answer('sometimes')).toEqual({ value: undefined, note: 'sometimes' });
    expect(flag('copper wiring present ou')).toEqual({
      value: true,
      note: 'copper wiring present ou',
    });
    expect(flag('NONE')).toEqual({ value: false, note: null });
  });

  it('keeps the Snellen line and the exact notation', () => {
    expect(acuity('6/6')).toEqual({ value: '6/6', note: null });
    expect(acuity('6/7.5 -1')).toEqual({ value: '6/7.5', note: '6/7.5 -1' });
    expect(acuity('6/4')).toEqual({ value: null, note: '6/4' });
  });

  it('maps a known label and treats a blank cell as not asked', () => {
    expect(label(ID_TYPE, 'ID type', 'Ghana Card')).toBe('NATIONAL_ID');
    expect(label(ID_TYPE, 'ID type', '  ')).toBeUndefined();
  });

  it('refuses a label it does not know rather than guessing', () => {
    expect(() => label(ID_TYPE, 'ID type', 'drivers licence')).toThrow(UnknownLabelError);
  });
});

describe('times, dates and lists', () => {
  it('reads the session time in every way Sheets may export it', () => {
    expect(atTime(DATE, '8:05')?.toISOString()).toBe('2026-10-10T08:05:00.000Z');
    expect(atTime(DATE, '08:05:30')?.toISOString()).toBe('2026-10-10T08:05:30.000Z');
    expect(atTime(DATE, '1:15 PM')?.toISOString()).toBe('2026-10-10T13:15:00.000Z');
    expect(atTime(DATE, '12:10 AM')?.toISOString()).toBe('2026-10-10T00:10:00.000Z');
    expect(atTime(DATE, '25:00')).toBeNull();
    expect(atTime(DATE, 'morning')).toBeNull();
  });

  it('reads dd/mm/yyyy and refuses dates that do not exist', () => {
    expect(parseDate('14/03/1968')?.toISOString()).toBe('1968-03-14T00:00:00.000Z');
    expect(parseDate('31/02/1990')).toBeNull();
    expect(parseDate('15th March 1977')?.toISOString()).toBe('1977-03-15T00:00:00.000Z');
    expect(parseDate('2 April 1984')?.toISOString()).toBe('1984-04-02T00:00:00.000Z');
    expect(parseDate('1st Jan, 1972')?.toISOString()).toBe('1972-01-01T00:00:00.000Z');
    expect(parseDate('31st June 1990')).toBeNull();
    expect(parseDate('3rd November,1975')?.toISOString()).toBe('1975-11-03T00:00:00.000Z');
    expect(parseDate('March 3rd 1980')?.toISOString()).toBe('1980-03-03T00:00:00.000Z');
    expect(parseDate('3 Marhc 1990')).toBeNull();
    expect(parseDate('03-14-1968')).toBeNull();
  });

  it('splits free-text lists and drops "none"', () => {
    expect(splitList('Metformin 500mg, amlodipine; aspirin')).toEqual([
      'Metformin 500mg',
      'amlodipine',
      'aspirin',
    ]);
    expect(splitList('None')).toEqual([]);
    expect(splitList('')).toEqual([]);
  });
});

describe('mapPatient', () => {
  it('maps a full visit to inputs every service accepts', async () => {
    const plan = mapPatient(fullVisit(), DATE);
    expect(plan.warnings).toEqual([]);
    expect(plan.patient).toMatchObject({
      firstName: 'Ama',
      nationalIdType: 'NATIONAL_ID',
      nationalId: 'GHA-000000001-1',
      sex: 'FEMALE',
      residentialRegion: 'GREATER_ACCRA',
    });
    expect(plan.consent).toBe(true);
    expect(plan.checkIn).toMatchObject({
      status: 'COMPLETED',
      checkedInAt: new Date('2026-10-10T08:15:00Z'),
    });
    expect(plan.checkIn.notes).toContain('Main concern: Headaches');

    const e = plan.encounter!;
    // The exact validation each service, or the HTTP ValidationPipe in front of it, applies.
    await new ClinicalMeasurementsService({} as PrismaService).validateAndNormalize({
      ...e.vitals,
      encounterId: importId(DATE, 'V-001', 'encounter'),
    });
    await validateDto(UpsertHypertensionAssessmentDto, e.hypertension!);
    await validateDto(UpsertDiabetesScreeningDto, e.diabetes!);
    await validateDto(UpsertEyeScreeningDto, e.eye!);
    await validateDto(UpsertCounsellingDto, e.counselling!);
    for (const h of e.history) await validateDto(CreateMedicalHistoryDto, h);
    for (const m of e.medications) await validateDto(CreatePatientMedicationDto, m);

    expect(e.hypertension).toMatchObject({
      hypertensionStatus: 'KNOWN_HYPERTENSION',
      repeatPerformed: 'YES',
      repeatSystolicBp: 148,
    });
    expect(e.diabetes).toMatchObject({
      glucoseMgDl: 132,
      glucoseType: 'FASTING',
      symptoms: ['POLYDIPSIA'],
      diabetesStatus: 'NO_KNOWN_DIABETES',
    });
    expect(e.diabetes!.notes).toContain('numb or tingling feet');
    expect(e.counselling).toMatchObject({
      topics: ['BLOOD_PRESSURE', 'GLUCOSE_DIABETES', 'WEIGHT_NUTRITION'],
      followUpWindow: 'WITHIN_1_MONTH',
      referralUrgency: 'SOON',
    });
    expect(e.counselling!.adviceGiven).toContain('Amlodipine 5mg daily x 30');
    expect(e.history.map((h) => h.category)).toEqual([
      'CONDITION',
      'CONDITION',
      'ALLERGY',
      'FAMILY_HISTORY',
      'SOCIAL_HISTORY',
    ]);
    expect(e.medications).toHaveLength(2);
    expect((e.vitals!.vitals as { notes: string }).notes).toContain('Waist circumference: 96 cm.');
  });

  it('gives the same ids on every run, so a re-run finds what it wrote', () => {
    expect(mapPatient(fullVisit(), DATE).checkIn.id).toBe(mapPatient(fullVisit(), DATE).checkIn.id);
    expect(mapPatient(fullVisit('V-002'), DATE).checkIn.id).not.toBe(
      mapPatient(fullVisit(), DATE).checkIn.id,
    );
  });

  it('imports a patient with no ID document as NONE', () => {
    const plan = mapPatient(
      sheetPatient('V-010', {
        checkIn: {
          'First name': 'Kwame',
          'Last name': 'Boateng',
          'ID type': 'None',
          Arrived: '10:00',
        },
      }),
      DATE,
    );
    expect(plan.patient).toMatchObject({ nationalIdType: 'NONE', nationalId: '' });
    expect(plan.encounter).toBeNull();
  });

  it('collects every problem in a row before refusing it', () => {
    const row = sheetPatient('V-011', {
      checkIn: {
        'First name': 'Kwame',
        'ID type': 'Drivers licence',
        'Date of birth': '31/02/1990',
      },
      bp: { 'Systolic 1': '1x0', 'Diastolic 1': '80', Arm: 'Left arm' },
    });
    try {
      mapPatient(row, DATE);
      fail('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(RowRejectedError);
      const reasons = (error as RowRejectedError).reasons.join('\n');
      expect(reasons).toContain('"Last name" is blank');
      expect(reasons).toContain('"Drivers licence" is not an allowed value');
      expect(reasons).toContain('"Date of birth" is not a date');
      expect(reasons).toContain('"Systolic 1" is not a whole number');
    }
  });

  it('keeps a partial date of birth as written instead of inventing a day', () => {
    const plan = mapPatient(
      sheetPatient('V-014', {
        checkIn: {
          'First name': 'A',
          'Last name': 'B',
          'Date of birth': '1980',
          'Age (yrs)': '46',
        },
      }),
      DATE,
    );
    expect(plan.patient.dob).toBeUndefined();
    expect(plan.checkIn.notes).toContain('Date of birth as written on the sheet: 1980.');
  });

  it('refuses an ID number on a row marked "None"', () => {
    const row = sheetPatient('V-012', {
      checkIn: { 'First name': 'A', 'Last name': 'B', 'ID type': 'None', 'ID number': '123' },
    });
    expect(() => mapPatient(row, DATE)).toThrow('ID type" is None but an ID number is filled in');
  });

  it('fills what the services require but the sheet left blank, and says so', async () => {
    const row = sheetPatient('V-013', {
      checkIn: { 'First name': 'A', 'Last name': 'B', Arrived: '11:00' },
      bp: { 'Systolic 1': '130', 'Diastolic 1': '85' },
      review: { 'Follow-up?': 'Yes', 'Referral?': 'Yes', 'Advice given': 'Rest' },
    });
    const plan = mapPatient(row, DATE);
    expect(plan.warnings).toEqual([
      'BP recorded without the arm; stored as "Other: not recorded"',
      'Follow-up recommended without a timing; stored as Other: not recorded',
      'Referral recommended without a destination; stored as not recorded',
    ]);
    await new ClinicalMeasurementsService({} as PrismaService).validateAndNormalize({
      ...plan.encounter!.vitals,
      encounterId: importId(DATE, 'V-013', 'encounter'),
    });
    await validateDto(UpsertCounsellingDto, plan.encounter!.counselling!);
  });
});

describe('mapPatient on a sheet filled by hand', () => {
  it('applies the agreed rules and keeps every word it could not store', async () => {
    const row = fullVisit('V-030');
    Object.assign(row.tabs.checkIn, {
      Sex: '',
      Status: 'female',
      'ID type': '',
      'ID number': 'GHA-123456789-0',
      'Date of birth': '2 April 1984',
      Region: 'central',
      'Research consent': 'yea',
    });
    Object.assign(row.tabs.bp, { Arm: 'left  arm', 'Cuff size': '22-42' });
    Object.assign(row.tabs.glucose, {
      'Glucose (mg/dL)': '',
      'mmol/L': '22.9/23.4',
      'Test type': 'RBS',
      'Excess thirst': 'Normal',
      'Frequent urination': 'Yes, during the night',
      'Blurred vision': 'wears glasses',
    });
    Object.assign(row.tabs.eye, {
      'Eye complaint?': 'blurry vision OU',
      'VA right (OD) unaided': '6/6-2',
      'Hypertensive signs?': 'copper wiring present ou',
      'Diabetic signs?': 'NONE',
      'Referral?': 'YES',
    });
    Object.assign(row.tabs.review, {
      BP: '108/67',
      Tobacco: 'no',
      'Follow-up?': '',
      'Follow-up when': '2 weeks',
      Urgency: 'important',
    });

    const plan = mapPatient(row, DATE);
    expect(plan.patient).toMatchObject({
      sex: 'FEMALE',
      nationalIdType: 'NATIONAL_ID',
      residentialRegion: 'CENTRAL',
      dob: new Date('1984-04-02T00:00:00Z'),
    });
    expect(plan.consent).toBe(true);
    expect(plan.checkIn.status).toBe('COMPLETED');
    const e = plan.encounter!;
    expect(e.vitals!.vitals).toMatchObject({
      bpSite: 'LEFT_ARM',
      cuffSize: 'OTHER',
      cuffSizeOther: '22-42 cm cuff',
    });
    expect(e.diabetes).toMatchObject({
      glucoseMgDl: 412,
      glucoseType: 'RANDOM',
      symptoms: ['POLYURIA'],
    });
    expect(e.diabetes!.notes).toContain('Two readings written on the sheet: 22.9/23.4 mmol/L');
    expect(e.diabetes!.notes).toContain('Blurred vision (as written on the sheet): wears glasses');
    expect(e.eye).toMatchObject({
      hasEyeComplaint: true,
      complaintHistory: expect.stringContaining('blurry vision OU'),
      vaOdUnaided: '6/6',
      hypertensiveSignsSeen: true,
      diabeticSignsSeen: false,
      referralRecommended: true,
    });
    expect(e.eye!.notes).toContain('VA right (OD) unaided (as written on the sheet): 6/6-2');
    expect(e.counselling).toMatchObject({
      followUpRecommended: true,
      followUpWindow: 'OTHER',
      followUpOther: '2 weeks',
      referralUrgency: null,
    });
    expect(e.counselling!.topics).toContain('BLOOD_PRESSURE');
    expect(e.counselling!.topics).not.toContain('TOBACCO');
    expect(e.counselling!.adviceGiven).toContain('BP: 108/67');
    expect(e.counselling!.adviceGiven).toContain('Urgency (as written on the sheet): important');

    await new ClinicalMeasurementsService({} as PrismaService).validateAndNormalize({
      ...e.vitals,
      encounterId: importId(DATE, 'V-030', 'encounter'),
    });
    await validateDto(UpsertDiabetesScreeningDto, e.diabetes!);
    await validateDto(UpsertEyeScreeningDto, e.eye!);
    await validateDto(UpsertCounsellingDto, e.counselling!);
  });
});

describe('validateDto', () => {
  it('refuses what the HTTP ValidationPipe would refuse', async () => {
    await expect(validateDto(UpsertCounsellingDto, { topics: ['NOT_A_TOPIC'] })).rejects.toThrow(
      'UpsertCounsellingDto is invalid',
    );
    await expect(
      validateDto(UpsertCounsellingDto, {
        ...mapPatient(fullVisit(), DATE).encounter!.counselling,
        extra: 1,
      }),
    ).rejects.toThrow('extra');
  });
});

describe('compareDerivations', () => {
  it('finds nothing when the sheet and Nkwapa agree', () => {
    expect(compareDerivations(fullVisit())).toEqual([]);
  });

  it('lists each place the sheet formula and Nkwapa disagree', () => {
    const row = sheetPatient('V-020', {
      bp: { 'Avg systolic': '125', 'Avg diastolic': '75', Category: 'Normal' },
      glucose: { 'Glucose (mg/dL)': '70', 'Test type': 'Random', Result: 'Not suspected' },
      body: { 'Weight (kg)': '70', 'Height (cm)': '170', BMI: '25.1' },
    });
    expect(compareDerivations(row)).toEqual([
      { visitId: 'V-020', field: 'BP category', sheet: 'Normal', nkwapa: 'ELEVATED' },
      // Nkwapa counts 70 mg/dL as low; the sheet's formula used "under 70".
      { visitId: 'V-020', field: 'Glucose result', sheet: 'Not suspected', nkwapa: 'LOW' },
      { visitId: 'V-020', field: 'BMI', sheet: '25.1', nkwapa: '24.2' },
    ]);
  });
});
