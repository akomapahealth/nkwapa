import { apiFetch, ApiError, resetPendingIdempotencyKeys } from './api';

describe('apiFetch idempotency keys (#307)', () => {
  const fetchMock = jest.fn();
  const sentKeys = () =>
    fetchMock.mock.calls.map(([, init]) => (init.headers as Headers).get('Idempotency-Key'));

  beforeEach(() => {
    resetPendingIdempotencyKeys();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  const save = () =>
    apiFetch('/clinics/c1/ops/checkins', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'p1' }),
    });

  it('reuses the key when a write is retried after a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 201 }));

    await expect(save()).rejects.toBeInstanceOf(ApiError);
    await save();

    const [first, second] = sentKeys();
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(second).toBe(first);
  });

  it('reuses the key after a 5xx and starts a new one after a definitive answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 201 }));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 201 }));

    await save();
    await save();
    await save();

    const [first, retry, next] = sentKeys();
    expect(retry).toBe(first);
    expect(next).not.toBe(first);
  });

  it('gives a different action its own key and leaves reads alone', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(save()).rejects.toBeInstanceOf(ApiError);
    await expect(
      apiFetch('/clinics/c1/ops/checkins', {
        method: 'POST',
        body: JSON.stringify({ patientId: 'p2' }),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/clinics/c1/ops/checkins')).rejects.toBeInstanceOf(ApiError);

    const [a, b, read] = sentKeys();
    expect(b).not.toBe(a);
    expect(read).toBeNull();
  });

  it('sends a caller-named key as given', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await apiFetch('/x', { method: 'PUT', body: '{}', idempotencyKey: 'screening-save-123' });

    expect(sentKeys()).toEqual(['screening-save-123']);
  });
});
