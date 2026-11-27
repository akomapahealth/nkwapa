import {
  BP_ESCALATION_DIASTOLIC,
  BP_ESCALATION_SYSTOLIC,
  BP_MAX_READINGS,
  BP_REPEAT_PROMPT_DIASTOLIC,
  BP_REPEAT_PROMPT_SYSTOLIC,
} from '@nkwapa/db/bp-classification';
import {
  DM_FASTING_SUSPICION_MG_DL,
  DM_RANDOM_SUSPICION_MG_DL,
} from '@nkwapa/db/diabetes-thresholds';
import { formatGlucose } from '@nkwapa/db/measurement-units';
import type { ClinicStation } from './stations';
import {
  GUIDED_STATION_KINDS,
  guideNextStation,
  nextStepLine,
  stationGuideSteps,
  stationGuideTitle,
} from './station-guide';

const text = (kind: Parameters<typeof stationGuideSteps>[0], unit: 'MG_DL' | 'MMOL_L' = 'MG_DL') =>
  stationGuideSteps(kind, { glucoseUnit: unit, nextName: 'Blood pressure' }).join('\n');

describe('station guide (#412)', () => {
  it('guides every station kind except CUSTOM, in five lines at most', () => {
    expect(GUIDED_STATION_KINDS).not.toContain('CUSTOM');
    expect(GUIDED_STATION_KINDS).toHaveLength(6);
    for (const kind of GUIDED_STATION_KINDS) {
      const steps = stationGuideSteps(kind, { glucoseUnit: 'MG_DL' });
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.length).toBeLessThanOrEqual(5);
    }
  });

  it('states the blood pressure thresholds the form enforces', () => {
    const bp = text('BLOOD_PRESSURE');
    expect(bp).toContain(
      `Top number ${BP_REPEAT_PROMPT_SYSTOLIC} or more, or bottom ${BP_REPEAT_PROMPT_DIASTOLIC} or more`,
    );
    expect(bp).toContain(
      `Top number ${BP_ESCALATION_SYSTOLIC} or more, or bottom ${BP_ESCALATION_DIASTOLIC} or more`,
    );
    // Any one danger symptom is enough, as in checkDangerSigns.
    expect(bp).toMatch(/any one of chest pain, .+ or blurred or changed vision/);
    expect(bp).toContain(`2 to ${BP_MAX_READINGS} readings`);
    expect(bp).toContain('chest pain');
  });

  it('states glucose thresholds in the clinic unit', () => {
    expect(text('GLUCOSE', 'MG_DL')).toContain(
      `fasting or before a meal, ${formatGlucose(DM_FASTING_SUSPICION_MG_DL, 'MG_DL')} or more`,
    );
    const mmol = text('GLUCOSE', 'MMOL_L');
    expect(mmol).toContain(`before a meal, ${formatGlucose(DM_FASTING_SUSPICION_MG_DL, 'MMOL_L')}`);
    expect(mmol).toContain(
      `2 hours after a meal or random, ${formatGlucose(DM_RANDOM_SUSPICION_MG_DL, 'MMOL_L')}`,
    );
    expect(mmol).not.toContain('mg/dL');
  });

  it('follows a changed threshold with no copy edit', () => {
    jest.isolateModules(() => {
      jest.doMock('@nkwapa/db/bp-classification', () => ({
        ...jest.requireActual('@nkwapa/db/bp-classification'),
        BP_REPEAT_PROMPT_SYSTOLIC: 150,
        BP_ESCALATION_SYSTOLIC: 190,
      }));
      const changed = require('./station-guide') as typeof import('./station-guide');
      const bp = changed.stationGuideSteps('BLOOD_PRESSURE', { glucoseUnit: 'MG_DL' }).join('\n');
      expect(bp).toContain(`Top number 150 or more, or bottom ${BP_REPEAT_PROMPT_DIASTOLIC}`);
      expect(bp).toContain(`Top number 190 or more, or bottom ${BP_ESCALATION_DIASTOLIC}`);
      expect(bp).not.toContain(`Top number ${BP_REPEAT_PROMPT_SYSTOLIC} or more`);
    });
  });

  it('does not say "station" twice', () => {
    expect(stationGuideTitle('Blood pressure')).toBe('How the Blood pressure station works');
    expect(stationGuideTitle('Eye station')).toBe('How the Eye station works');
  });

  it('registration covers the existing chart, no ID and the send-on step', () => {
    const intake = text('INTAKE');
    expect(intake).toContain('Check in and start');
    expect(intake).toContain('No ID with them today');
    expect(intake).toContain('Register and start');
    expect(intake).toContain('Send to Blood pressure');
  });

  it('takes the next station from the clinic order, and review ends the visit', () => {
    const station = (id: string, kind: ClinicStation['kind'], sortOrder: number, active = true) =>
      ({ id, kind, sortOrder, active, name: `${kind} desk` }) as ClinicStation;
    const stations = [
      station('a', 'INTAKE', 1),
      station('b', 'GLUCOSE', 2),
      station('c', 'BLOOD_PRESSURE', 3, false),
      station('d', 'REVIEW', 4),
    ];
    expect(guideNextStation(stations, 'INTAKE')?.id).toBe('b');
    expect(guideNextStation(stations, 'GLUCOSE')?.id).toBe('d');
    expect(guideNextStation(stations, 'BLOOD_PRESSURE')).toBeNull();
    expect(nextStepLine('GLUCOSE', 'REVIEW desk')).toBe(
      'Next: REVIEW desk. Tell them: “Go to REVIEW desk and show them your card.”',
    );
    expect(nextStepLine('EYE', null)).toBeNull();
    expect(nextStepLine('REVIEW', null)).toMatch(/^Last station/);
  });
});
