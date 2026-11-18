/**
 * @jest-environment jsdom
 */
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

const apiFetch = jest.fn();
const showToast = jest.fn();
const connection = { isOnline: true, authMode: 'online' as 'online' | 'offline-session' };

jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  getErrorMessage: (_err: unknown, fallback: string) => fallback,
  readApiError: async () => new Error('failed'),
}));
// Stable across renders, as the real hooks are, or the fetch effect reruns forever.
const getToken = async () => 'token';
const bootstrapValue = {
  bootstrap: {
    activeClinicId: 'c1',
    memberships: [{ clinicId: 'c1', clinicName: 'Cape Coast Clinic', roles: ['DOCTOR'] }],
    // As the API sends it; without it the active clinic is rebuilt on every render.
    availableClinics: [{ clinicId: 'c1', clinicName: 'Cape Coast Clinic', zoneCode: null }],
    globalRoles: [],
    effectiveRolesForActiveClinic: ['DOCTOR'],
    effectivePermissionsForActiveClinic: ['DASHBOARD.READ', 'OPS.CHECKIN.READ'],
  },
};
jest.mock('@/lib/auth-context', () => ({ useAuth: () => getToken }));
const toastValue = { showToast: (...args: unknown[]) => showToast(...args) };
jest.mock('@/components/ui/toast', () => ({ useToast: () => toastValue }));
jest.mock('@/app/ServiceWorkerAndSyncProvider', () => ({
  useSync: () => ({ isOnline: connection.isOnline }),
}));
jest.mock('@/app/KeycloakProvider', () => ({
  useKeycloak: () => ({ authMode: connection.authMode }),
}));
jest.mock('@/lib/bootstrap-context', () => ({ useBootstrap: () => bootstrapValue }));
// The volunteer and fallback homes are not rendered for a doctor; stubbed to skip their CSS.
jest.mock('@/components/dashboard/VolunteerWelcome', () => ({ VolunteerWelcome: () => null }));
jest.mock('@/components/dashboard/VolunteerClinicDay', () => ({ VolunteerClinicDay: () => null }));
jest.mock('@/components/dashboard/NeedsYouNow', () => ({ NeedsYouNow: () => null }));
jest.mock('@/components/dashboard/VolunteerDashboard', () => ({ VolunteerDashboard: () => null }));
jest.mock('@/components/dashboard/ClinicalMeasurementsDashboard', () => ({
  ClinicalMeasurementsDashboard: () => null,
}));
jest.mock('@/components/dashboard/SummaryCards', () => ({ SummaryCards: () => null }));
// AppState imports a CSS module Jest cannot parse; the error state only needs its title here.
jest.mock('@/components/feedback/AppState', () => ({
  DashboardLoadingState: () => null,
  SelectClinicState: () => null,
  InlineErrorState: ({ title }: { title: string }) => createElement('p', null, title),
}));
jest.mock('@/components/RouteGuard', () => ({
  RouteGuard: ({ children }: { children: ReactNode }) => children,
}));
// The role homes are not under test; the page's offline handling is.
jest.mock('@/components/dashboard/RoleHome', () => ({
  RoleHome: ({ data, status, refresh }: { data: unknown; status: ReactNode; refresh: ReactNode }) =>
    createElement(
      'div',
      null,
      createElement('p', { 'data-testid': 'figures' }, data ? 'figures' : 'none'),
      status,
      refresh,
    ),
}));

import DashboardPage from './page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render() {
  await act(async () => root.render(createElement(DashboardPage)));
}

beforeEach(() => {
  jest.clearAllMocks();
  connection.isOnline = true;
  connection.authMode = 'online';
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ summary: {} }) });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const notice = () => container.querySelector('[data-testid="dashboard-offline-notice"]');

describe('DashboardPage offline (OFF-01)', () => {
  it('in an offline session shows the notice, calls no API and raises no toast', async () => {
    connection.authMode = 'offline-session';
    await render();

    expect(notice()?.textContent).toContain('Dashboard figures need a connection.');
    expect(container.querySelector('a[href="/today"]')).not.toBeNull();
    expect(container.querySelector('a[href="/clinics/c1/patients"]')).not.toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(container.querySelector('button[aria-label="Refresh"]')).toBeNull();
    expect(container.textContent).not.toMatch(/could not load|couldn't load/i);
  });

  it('online, loads the figures with no notice', async () => {
    await render();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(notice()).toBeNull();
    expect(container.querySelector('[data-testid="figures"]')?.textContent).toBe('figures');
  });

  it('keeps loaded figures when the connection drops, and says when they were loaded', async () => {
    await render();
    connection.isOnline = false;
    await render();

    expect(container.querySelector('[data-testid="figures"]')?.textContent).toBe('figures');
    expect(notice()?.textContent).toContain('Showing what this page loaded at');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('online but failing still shows the error, as before', async () => {
    apiFetch.mockResolvedValue({ ok: false });
    await render();

    expect(notice()).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
  });
});
