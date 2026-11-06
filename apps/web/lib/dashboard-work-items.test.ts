import { describeWorkItems, type DashboardWorkItem } from './dashboard-work-items';

const item = (name: string, code: string, station: string | null = null): DashboardWorkItem => ({
  encounterId: code,
  patientCode: code,
  patientName: name,
  station,
});

describe('describeWorkItems (#307)', () => {
  it('names the patients and the station each one is at', () => {
    expect(
      describeWorkItems([item('Kofi Asante', 'NK-1', 'Vitals'), item('Ama Owusu', 'NK-2')], 2),
    ).toBe('Kofi Asante (NK-1) at Vitals and Ama Owusu (NK-2).');
  });

  it('says how many more there are past the names sent', () => {
    expect(describeWorkItems([item('Kofi Asante', 'NK-1')], 4)).toBe(
      'Kofi Asante (NK-1) and 3 more.',
    );
  });

  it('falls back to the count alone when no names were sent', () => {
    expect(describeWorkItems(undefined, 3)).toBeUndefined();
    expect(describeWorkItems([], 3)).toBeUndefined();
  });
});
