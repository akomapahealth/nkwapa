import { formatBytes, getStorageDiagnostics, requestPersistentStorage } from './storage';

function withStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { storage },
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
});

describe('storage durability (#206)', () => {
  it('does not ask again once storage is already persistent', async () => {
    const persist = jest.fn();
    withStorage({ persisted: async () => true, persist });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks and reports what the browser decided', async () => {
    withStorage({ persisted: async () => false, persist: async () => false });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('says it cannot tell where the API is missing or throws', async () => {
    withStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBeNull();
    withStorage({
      persisted: async () => {
        throw new Error('blocked');
      },
      persist: jest.fn(),
    });
    await expect(requestPersistentStorage()).resolves.toBeNull();
  });

  it('collects the persisted state and estimate, with unknowns as null', async () => {
    withStorage({
      persisted: async () => true,
      estimate: async () => ({ usage: 2048, quota: 4096 }),
    });
    await expect(getStorageDiagnostics()).resolves.toEqual({
      persisted: true,
      usageBytes: 2048,
      quotaBytes: 4096,
    });
    withStorage(undefined);
    await expect(getStorageDiagnostics()).resolves.toEqual({
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
    });
  });

  it.each([
    [null, 'unknown'],
    [100, '1 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('formats %p as %p', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
