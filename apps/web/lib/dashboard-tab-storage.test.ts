/** @jest-environment jsdom */
import { pickDashboardTab, readDashboardTab, writeDashboardTab } from './dashboard-tab-storage';

describe('the remembered dashboard tab (#315)', () => {
  beforeEach(() => localStorage.clear());

  it('is kept per user and clinic', () => {
    writeDashboardTab('user-1', 'clinic-1', 'network');
    expect(readDashboardTab('user-1', 'clinic-1')).toBe('network');
    expect(readDashboardTab('user-1', 'clinic-2')).toBeNull();
    expect(readDashboardTab('user-2', 'clinic-1')).toBeNull();
  });

  it('falls back to the first tab when the stored one is gone', () => {
    expect(pickDashboardTab('network', ['clinic', 'network'])).toBe('network');
    expect(pickDashboardTab('network', ['clinic', 'doctor'])).toBe('clinic');
    expect(pickDashboardTab(null, ['clinic', 'doctor'])).toBe('clinic');
  });

  it('reads nothing when storage throws', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readDashboardTab('user-1', 'clinic-1')).toBeNull();
    getItem.mockRestore();
  });
});
