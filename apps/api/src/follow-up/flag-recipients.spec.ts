import { flagRecipients, type ClinicStaff } from './flag-recipients';

const roles: ClinicStaff['roles'] = [
  { userId: 'doc-a', role: 'DOCTOR' },
  { userId: 'doc-b', role: 'DOCTOR' },
  { userId: 'vol-a', role: 'VOLUNTEER' },
  { userId: 'mgr', role: 'MANAGER' },
  { userId: 'dir', role: 'DIRECTOR' },
];
const onShift: ClinicStaff['onShift'] = [
  { userId: 'doc-a', role: 'DOCTOR' },
  { userId: 'vol-a', role: 'VOLUNTEER' },
  { userId: 'mgr', role: 'MANAGER' },
];
const sorted = (ids: string[]) => [...ids].sort();

describe('flagRecipients (#337)', () => {
  describe('URGENT', () => {
    it('on shift: clinical staff on shift and every manager, never the recorder', () => {
      expect(sorted(flagRecipients('URGENT', { onShift, roles }, 'vol-a'))).toEqual([
        'doc-a',
        'mgr',
      ]);
    });

    it('nobody clinical on shift: the clinic doctors and managers', () => {
      const managerOnly = [{ userId: 'mgr', role: 'MANAGER' as const }];
      expect(sorted(flagRecipients('URGENT', { onShift: managerOnly, roles }))).toEqual([
        'doc-a',
        'doc-b',
        'mgr',
      ]);
    });
  });

  it.each(['HIGH', 'SEVERE_BP'] as const)(
    '%s: FOLLOW_UP.MANAGE holders and doctors on shift, not directors',
    (event) => {
      const offShiftDoctorOnly = {
        onShift: [],
        roles: [{ userId: 'doc-b', role: 'DOCTOR' as const }],
      };
      expect(sorted(flagRecipients(event, { onShift, roles }))).toEqual([
        'doc-a',
        'doc-b',
        'mgr',
        'vol-a',
      ]);
      // A doctor holds FOLLOW_UP.MANAGE, so is told on or off shift.
      expect(flagRecipients(event, offShiftDoctorOnly)).toEqual(['doc-b']);
    },
  );

  it('NOT_IMPROVING: the clinic doctors only', () => {
    expect(sorted(flagRecipients('NOT_IMPROVING', { onShift: [], roles }))).toEqual([
      'doc-a',
      'doc-b',
    ]);
  });

  it('UNACKNOWLEDGED: managers and directors, on shift or not', () => {
    expect(sorted(flagRecipients('UNACKNOWLEDGED', { onShift: [], roles }))).toEqual([
      'dir',
      'mgr',
    ]);
  });

  it('DIGEST: directors only', () => {
    expect(flagRecipients('DIGEST', { onShift, roles })).toEqual(['dir']);
  });

  it('lists someone holding two roles once', () => {
    const both = [...roles, { userId: 'mgr', role: 'DIRECTOR' as const }];
    expect(
      flagRecipients('UNACKNOWLEDGED', { onShift: [], roles: both }).filter((id) => id === 'mgr'),
    ).toHaveLength(1);
  });
});
