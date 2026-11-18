/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const startSignInSetup = jest.fn();
const keycloakLib = { result: null as null | { status: string; action?: string } };
const connection = { isOnline: true, authMode: 'online' as 'online' | 'offline-session' };

jest.mock('@/lib/keycloak', () => ({
  startSignInSetup: (...args: unknown[]) => startSignInSetup(...args),
  peekSignInSetupResult: () => keycloakLib.result,
  clearSignInSetupResult: () => {
    keycloakLib.result = null;
  },
}));
jest.mock('@/app/ServiceWorkerAndSyncProvider', () => ({
  useSync: () => ({ isOnline: connection.isOnline }),
}));
jest.mock('@/app/KeycloakProvider', () => ({
  useKeycloak: () => ({ authMode: connection.authMode }),
}));

import { SignInSecurityCard } from './SignInSecurityCard';

let container: HTMLDivElement;
let root: Root;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(SignInSecurityCard)));
}

function button(name: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(name));
}

beforeEach(() => {
  startSignInSetup.mockReset();
  keycloakLib.result = null;
  connection.isOnline = true;
  connection.authMode = 'online';
  (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential = function () {};
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SignInSecurityCard', () => {
  it('starts authenticator app and passkey setup', async () => {
    await render();
    act(() => button('Set up authenticator app')!.click());
    act(() => button('Add a passkey')!.click());
    expect(startSignInSetup.mock.calls).toEqual([['CONFIGURE_TOTP'], ['webauthn-register']]);
  });

  it('offers no passkey where the browser has none', async () => {
    delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    await render();
    expect(button('Add a passkey')).toBeUndefined();
  });

  it.each([
    ['offline', () => (connection.isOnline = false)],
    ['in an offline session', () => (connection.authMode = 'offline-session')],
  ])('cannot start setup %s', async (_label, set) => {
    set();
    await render();
    expect(button('Set up authenticator app')!.disabled).toBe(true);
    expect(container.textContent).toContain('Needs a connection.');
  });

  it('reports the result of a setup once', async () => {
    keycloakLib.result = { status: 'success', action: 'CONFIGURE_TOTP' };
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Authenticator app set up',
    );
    act(() => root.unmount());
    container.remove();
    await render();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('says nothing changed when setup is cancelled', async () => {
    keycloakLib.result = { status: 'cancelled', action: 'webauthn-register' };
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Setup was cancelled. Nothing changed.',
    );
  });
});
