/** @jest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { DiabetesScreeningRecord, VitalsRecord } from '@/lib/db';
import type { StationVisit } from '@/lib/stations';
import { StationResultsSummary, newlyRecorded } from './StationResultsSummary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/lib/bootstrap-context', () => ({
  useClinicUnits: () => ({ glucoseUnit: 'MG_DL', bodyUnit: 'METRIC' }),
}));

const glucose = { glucoseMgDl: 210, glucoseType: 'RANDOM' } as DiabetesScreeningRecord;
const bp = { systolicBp: 150, diastolicBp: 95 } as VitalsRecord;

function stop(kind: StationVisit['station']['kind'], status: StationVisit['status']): StationVisit {
  return {
    id: `${kind}-1`,
    status,
    station: { id: kind, name: kind, kind },
    completedBy: status === 'COMPLETED' ? { id: 'u1', displayName: 'Abena' } : null,
    completedAt: status === 'COMPLETED' ? '2026-11-21T09:30:00Z' : null,
  } as unknown as StationVisit;
}

function render(props: Partial<Parameters<typeof StationResultsSummary>[0]>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() =>
    createRoot(host).render(
      createElement(StationResultsSummary, {
        timeline: [],
        vitals: null,
        diabetes: null,
        timezone: 'Africa/Accra',
        ...props,
      }),
    ),
  );
  /** The text of the summary cell whose label is `label`. */
  return (label: string) =>
    [...host.querySelectorAll('dl > div')].find(
      (cell) => cell.querySelector('dt')?.textContent === label,
    )?.textContent ?? '';
}

describe('newlyRecorded', () => {
  it('names the rows that gained a reading, and only those', () => {
    expect(
      newlyRecorded({ vitals: bp, diabetes: null }, { vitals: bp, diabetes: glucose }),
    ).toEqual(['GLUCOSE']);
  });

  it('ignores a reading that was already there or went away', () => {
    expect(
      newlyRecorded({ vitals: bp, diabetes: glucose }, { vitals: bp, diabetes: glucose }),
    ).toEqual([]);
    expect(
      newlyRecorded({ vitals: bp, diabetes: glucose }, { vitals: null, diabetes: null }),
    ).toEqual([]);
  });
});

describe('StationResultsSummary', () => {
  it('says when a reading arrived after the screen opened', () => {
    const cell = render({
      timeline: [stop('GLUCOSE', 'COMPLETED')],
      diabetes: glucose,
      addedAt: { GLUCOSE: '2026-11-21T10:42:00Z' },
    });
    expect(cell('Blood glucose')).toContain('210');
    expect(cell('Blood glucose')).toContain('Added at 10:42');
    expect(cell('Blood pressure')).not.toContain('Added at');
  });

  it('shows a stop still under way as in progress, not as an empty reading', () => {
    const cell = render({
      timeline: [stop('GLUCOSE', 'IN_PROGRESS'), stop('BLOOD_PRESSURE', 'COMPLETED')],
    });
    expect(cell('Blood glucose')).toContain('In progress');
    expect(cell('Blood glucose')).not.toContain('Not recorded');
    expect(cell('Blood pressure')).toContain('Not recorded');
    expect(cell('Blood pressure')).toContain('Recorded by Abena');
  });
});
