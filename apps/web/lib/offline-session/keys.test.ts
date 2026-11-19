import {
  derivePinKey,
  deviceKeyFor,
  dropAllKeys,
  importDataKey,
  keyringEntries,
  restoreKeyring,
  isAcceptablePin,
  openText,
  randomBase64Url,
  sealText,
  unwrapDataKey,
  wrapDataKey,
} from './keys';

// Production uses 600,000; the derivation is the same at any count, and the suite stays fast.
const FAST = 1_000;

describe('offline session keys (#207)', () => {
  const raw = () => globalThis.crypto.getRandomValues(new Uint8Array(32));

  it('unwraps the data key with the right PIN and refuses a wrong one', async () => {
    const dek = raw();
    const salt = randomBase64Url(16);
    const wrapped = await wrapDataKey(dek, await derivePinKey('482913', salt, FAST), 'user-1');

    const unwrapped = await unwrapDataKey(
      wrapped,
      await derivePinKey('482913', salt, FAST),
      'user-1',
    );
    const sealed = await sealText(await importDataKey(dek), 'payload', 'aad');
    await expect(openText(unwrapped, sealed, 'aad')).resolves.toBe('payload');

    await expect(
      unwrapDataKey(wrapped, await derivePinKey('482914', salt, FAST), 'user-1'),
    ).rejects.toThrow();
  });

  it('binds a wrapped key to its person, so it cannot be moved to another row', async () => {
    const salt = randomBase64Url(16);
    const pinKey = await derivePinKey('482913', salt, FAST);
    const wrapped = await wrapDataKey(raw(), pinKey, 'user-1');
    await expect(unwrapDataKey(wrapped, pinKey, 'user-2')).rejects.toThrow();
  });

  it('keeps the unwrapped key inside WebCrypto', async () => {
    const salt = randomBase64Url(16);
    const pinKey = await derivePinKey('482913', salt, FAST);
    const key = await unwrapDataKey(await wrapDataKey(raw(), pinKey, 'u'), pinKey, 'u');
    expect(key.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('refuses ciphertext opened for different additional data', async () => {
    const key = await importDataKey(raw());
    const sealed = await sealText(key, 'secret', 'row-1');
    await expect(openText(key, sealed, 'row-2')).rejects.toThrow();
    expect(sealed.ct).not.toContain('secret');
  });

  it('derives with the full production cost by default', async () => {
    const started = Date.now();
    await derivePinKey('482913', randomBase64Url(16));
    // Not a benchmark: a guard against the default silently dropping to a cheap count.
    expect(Date.now() - started).toBeGreaterThan(20);
  });

  it.each([
    ['123456', true],
    ['123456789012', true],
    ['12345', false],
    ['12a456', false],
    ['1234567890123', false],
  ])('accepts %s as a PIN: %s', (pin, ok) => {
    expect(isAcceptablePin(pin)).toBe(ok);
  });
});

describe('handing the keyring to the service worker and back (#207)', () => {
  afterEach(() => dropAllKeys());

  it('restores well-formed keys only', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    restoreKeyring([
      ['clinic:clinic-a', key],
      ['clinic:../x', key],
      ['other:1', key],
      ['user:u1', 'not a key'],
      'junk',
    ]);
    expect(deviceKeyFor('clinic:clinic-a')).toBe(key);
    expect(keyringEntries().map(([scope]) => scope)).toEqual(['clinic:clinic-a']);
  });
});
