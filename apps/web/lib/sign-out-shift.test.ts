import { chooseAction } from '@/components/ui/confirm-dialog';
import { apiFetch } from './api';
import { getStoredActiveClinicId } from './bootstrap-storage';
import { getSignedInUserId } from './offline-session/bootstrap';
import { fetchActiveShifts } from './ops-api';
import { submitOpsWrite } from './ops-writes';
import { settleShiftBeforeSignOut } from './sign-out-shift';

jest.mock('@/components/ui/confirm-dialog', () => ({ chooseAction: jest.fn() }));
jest.mock('./bootstrap-storage', () => ({ getStoredActiveClinicId: jest.fn() }));
jest.mock('./offline-session/bootstrap', () => ({ getSignedInUserId: jest.fn() }));
jest.mock('./ops-api', () => ({ fetchActiveShifts: jest.fn() }));
jest.mock('./ops-writes', () => ({ submitOpsWrite: jest.fn() }));
jest.mock('./api', () => ({ apiFetch: jest.fn() }));

const choose = chooseAction as jest.Mock;
const fetchShifts = fetchActiveShifts as jest.Mock;
const submit = submitOpsWrite as jest.Mock;
const getToken = async () => 'token';

const shift = {
  shiftId: 's1',
  userId: 'u1',
  displayName: 'Abena',
  roleAtShift: 'VOLUNTEER',
  checkedInAt: '2026-11-21T09:12:00Z',
  status: 'ACTIVE',
};

beforeEach(() => {
  jest.resetAllMocks();
  (getStoredActiveClinicId as jest.Mock).mockReturnValue('k1');
  (getSignedInUserId as jest.Mock).mockReturnValue('u1');
  fetchShifts.mockResolvedValue({ items: [shift] });
  submit.mockResolvedValue({ outcome: 'applied' });
});

describe('settleShiftBeforeSignOut (#425)', () => {
  it('ends the shift, then lets sign-out go on', async () => {
    choose.mockResolvedValue('confirm');
    await expect(settleShiftBeforeSignOut(getToken)).resolves.toBe(true);
    expect(choose.mock.calls[0][0]).toMatchObject({
      confirmLabel: 'End shift and sign out',
      alternativeLabel: 'Sign out only',
      cancelLabel: 'Cancel',
    });
    expect(choose.mock.calls[0][0].description).toContain('on shift as Volunteer since 9:12 AM');
    expect(submit).toHaveBeenCalledWith(
      { kind: 'shiftCheckOut', shiftId: 's1' },
      expect.objectContaining({ clinicId: 'k1', actor: { userId: 'u1' } }),
    );
  });

  it('signs out only, leaving the shift running', async () => {
    choose.mockResolvedValue('alternative');
    await expect(settleShiftBeforeSignOut(getToken)).resolves.toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it('stops sign-out on Cancel', async () => {
    choose.mockResolvedValue('cancel');
    await expect(settleShiftBeforeSignOut(getToken)).resolves.toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it('asks nothing of someone off shift, or when the shift list cannot be read', async () => {
    fetchShifts.mockResolvedValueOnce({ items: [{ ...shift, userId: 'someone-else' }] });
    await expect(settleShiftBeforeSignOut(getToken)).resolves.toBe(true);
    fetchShifts.mockRejectedValueOnce(new Error('403'));
    await expect(settleShiftBeforeSignOut(getToken)).resolves.toBe(true);
    expect(choose).not.toHaveBeenCalled();
  });

  it('still signs out when ending the shift fails', async () => {
    choose.mockResolvedValue('confirm');
    submit.mockRejectedValue(new Error('500'));
    await expect(settleShiftBeforeSignOut(getToken)).resolves.toBe(true);
  });

  it('still asks when Log out is pressed before the workspace has loaded', async () => {
    (getStoredActiveClinicId as jest.Mock).mockReturnValue(null);
    (getSignedInUserId as jest.Mock).mockReturnValue(null);
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'u1', activeClinicId: 'k1' }),
    });
    choose.mockResolvedValue('confirm');
    await expect(settleShiftBeforeSignOut(getToken)).resolves.toBe(true);
    expect(fetchShifts).toHaveBeenCalledWith(expect.objectContaining({ clinicId: 'k1' }));
    expect(submit).toHaveBeenCalledWith(
      { kind: 'shiftCheckOut', shiftId: 's1' },
      expect.objectContaining({ clinicId: 'k1', actor: { userId: 'u1' } }),
    );
  });
});
