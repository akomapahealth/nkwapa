/** @jest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { apiFetch } from '@/lib/api';
import { CounsellingForm } from './CounsellingForm';
import { EyeScreeningForm } from './EyeScreeningForm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getToken = async () => 'token';
let online = true;
jest.mock('@/lib/auth-context', () => ({ useAuth: () => getToken }));
jest.mock('@/app/ServiceWorkerAndSyncProvider', () => ({
  useSync: () => ({ isOnline: online }),
}));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), apiFetch: jest.fn() }));
jest.mock('@/components/feedback/route-break.module.css', () => ({}));

const fetchMock = apiFetch as jest.Mock;

/** Type the way a keyboard does, so React's controlled value sees it. */
function type(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root!: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(element);
  });
  await flush();
  /** Re-render as the sync provider would on a connection change. */
  const setOnline = async (value: boolean) => {
    online = value;
    await act(async () => root.render(createElement(element.type, { ...element.props })));
    await flush();
  };
  return { host, setOnline };
}

beforeEach(() => {
  online = true;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ record: null }) });
});

describe('station forms keep typing through a connection flicker (#426)', () => {
  it('eye history: no refetch, no reset, no disabled field', async () => {
    const { host, setOnline } = await mount(
      createElement(EyeScreeningForm, { clinicId: 'k1', encounterId: 'e1', canEdit: true }),
    );
    await act(async () => {
      (host.querySelector('#hasEyeComplaint') as HTMLButtonElement).click();
    });
    const history = () =>
      host.querySelector('textarea[aria-label="Brief eye history"]') as HTMLTextAreaElement;
    type(history(), 'Blurred right eye since June');

    await setOnline(false);
    expect(history().value).toBe('Blurred right eye since June');
    expect(history().closest('fieldset')?.disabled).toBe(false);
    // Since #423 saving works offline too: it keeps the examination on the device.
    const save = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Save eye examination'),
    );
    expect(save?.disabled).toBe(false);

    await setOnline(true);
    expect(history().value).toBe('Blurred right eye since June');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('counselling: no refetch, no reset, no disabled field', async () => {
    const { host, setOnline } = await mount(
      createElement(CounsellingForm, { clinicId: 'k1', encounterId: 'e1', canEdit: true }),
    );
    const advice = () => host.querySelector('#adviceGiven') as HTMLTextAreaElement;
    type(advice(), 'Reduce salt');

    await setOnline(false);
    await setOnline(true);
    expect(advice().value).toBe('Reduce salt');
    expect(advice().closest('fieldset')?.disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a form opened offline loads once the connection returns, and stays read-only until then', async () => {
    online = false;
    const { host, setOnline } = await mount(
      createElement(CounsellingForm, { clinicId: 'k1', encounterId: 'e1', canEdit: true }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (host.querySelector('#adviceGiven') as HTMLTextAreaElement).closest('fieldset')?.disabled,
    ).toBe(true);
    await setOnline(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      (host.querySelector('#adviceGiven') as HTMLTextAreaElement).closest('fieldset')?.disabled,
    ).toBe(false);
  });
});
