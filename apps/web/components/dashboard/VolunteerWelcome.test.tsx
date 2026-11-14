/** @jest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('./volunteer-welcome.module.css', () => ({}));
jest.mock('lucide-react', () => ({
  Moon: () => null,
  Sun: () => null,
  Sunrise: () => null,
  Sunset: () => null,
}));
jest.mock('@/lib/bootstrap-context', () => ({
  useBootstrap: () => ({
    bootstrap: {
      activeClinicId: 'synthetic-clinic',
      displayName: 'Synthetic Volunteer',
      userId: 'synthetic-user',
      effectivePermissionsForActiveClinic: ['OPS.SHIFT.READ'],
    },
  }),
}));
jest.mock('./DashboardIllustration', () => ({ DashboardIllustration: () => null }));
const mountShift = jest.fn(() => null);
jest.mock('./DashboardShiftControls', () => ({ DashboardShiftControls: () => mountShift() }));
import { VolunteerWelcome } from './VolunteerWelcome';

test('the station flag off never mounts shift reads or actions, while the greeting and supplied action remain', () => {
  const previous = process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED;
  process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED = 'false';
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        createElement(VolunteerWelcome, { actions: createElement('button', null, 'Refresh') }),
      ),
    );
    expect(mountShift).not.toHaveBeenCalled();
    expect(host.querySelector('h1')?.textContent).toContain('Synthetic');
    expect(host.querySelector('button')?.textContent).toBe('Refresh');
  } finally {
    act(() => root.unmount());
    if (previous === undefined) delete process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED;
    else process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED = previous;
  }
});
