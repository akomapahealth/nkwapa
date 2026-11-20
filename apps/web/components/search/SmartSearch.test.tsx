/** @jest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

let mockBootstrap: Record<string, unknown> = {};
const mockPush = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/bootstrap-context', () => ({
  useBootstrap: () => ({ bootstrap: mockBootstrap }),
}));
// Stable, like the app's memoized getToken; a new function each render would re-run the search.
const mockGetToken = async () => 'token';
jest.mock('@/lib/auth-context', () => ({ useAuth: () => mockGetToken }));
jest.mock('@/lib/theme-context', () => ({ useTheme: () => ({ setPreference: jest.fn() }) }));
jest.mock('@/app/ServiceWorkerAndSyncProvider', () => ({
  useSync: () => ({ isOnline: true, syncNow: jest.fn(), setSyncCenterOpen: jest.fn() }),
}));
jest.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/offline-session/at-rest', () => ({ isSealedRow: () => false }));

import { SmartSearch } from './SmartSearch';

function signedIn(roles: string[], permissions: string[], globalRoles: string[] = []) {
  mockBootstrap = {
    userId: 'user-1',
    displayName: 'Synthetic User',
    activeClinicId: 'clinic-1',
    globalRoles,
    effectivePermissionsForActiveClinic: permissions,
    effectiveRolesForActiveClinic: roles,
    memberships: [{ clinicId: 'clinic-1', clinicName: 'Synthetic Clinic', roles }],
  };
}

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  // jsdom has neither; Radix and the result list call them.
  Element.prototype.scrollIntoView = jest.fn();
  window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as never;
});

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  mockPush.mockReset();
  mockApiFetch.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

const render = () => act(() => root.render(createElement(SmartSearch, { clinicId: 'clinic-1' })));
const pressCmdK = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  });
const input = () => document.querySelector<HTMLInputElement>('input[role="combobox"]');
const type = (value: string) =>
  act(() => {
    const field = input()!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
const options = () =>
  [...document.querySelectorAll('[role="option"]')].map((node) => node.textContent ?? '');

test('Cmd+K opens the bar, Enter goes to the highlighted page and remembers it', () => {
  signedIn([], ['*'], ['SYSTEM_ADMIN']);
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => [] });
  render();

  pressCmdK();
  expect(input()).not.toBeNull();
  expect(document.activeElement).toBe(input());

  type('team');
  expect(options()[0]).toContain('Staff');

  act(() => {
    input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(mockPush).toHaveBeenCalledWith('/admin/users');
  expect(localStorage.getItem('nkwapa:smart-search:recent:user-1:clinic-1')).toContain('Staff');
});

test('a volunteer is never offered admin pages or staff, and staff is never requested', async () => {
  signedIn(['VOLUNTEER'], ['PATIENT.READ', 'PATIENT.SEARCH']);
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => [] });
  render();
  pressCmdK();

  type('staff');
  await act(async () => {
    jest.advanceTimersByTime(200);
  });

  expect(options().join(' ')).not.toContain('Roles and access');
  const paths = mockApiFetch.mock.calls.map(([path]) => String(path));
  expect(paths.some((path) => path.includes('/patients/search'))).toBe(true);
  expect(paths.some((path) => path.includes('/users/search'))).toBe(false);
});

test('patients come from the clinic-scoped search route and open their chart', async () => {
  signedIn(['DOCTOR'], ['PATIENT.READ', 'PATIENT.SEARCH']);
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => [
      { id: 'p-1', patientCode: 'NKP-2026-000001', firstName: 'Ama', lastName: 'Mensah' },
    ],
  });
  render();
  pressCmdK();

  type('ama mensah');
  await act(async () => {
    jest.advanceTimersByTime(200);
  });

  expect(mockApiFetch.mock.calls[0][0]).toBe(
    '/clinics/clinic-1/patients/search?q=ama%20mensah&take=5',
  );
  const patient = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) =>
    node.textContent?.includes('NKP-2026-000001'),
  );
  expect(patient).toBeDefined();
  act(() => patient!.click());
  expect(mockPush).toHaveBeenCalledWith('/clinics/clinic-1/patients/p-1');
  // Charts are never kept in the recent list on a shared laptop.
  expect(localStorage.getItem('nkwapa:smart-search:recent:user-1:clinic-1') ?? '').not.toContain(
    'Mensah',
  );
});
