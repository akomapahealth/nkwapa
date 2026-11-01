import {
  decryptChatContent,
  encryptChatContent,
  readChatContent,
  UNREADABLE_MESSAGE,
} from './chat-crypto';

describe('chat encryption at rest', () => {
  const scope = { clinicId: 'clinic-1', conversationId: 'conv-1' };
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.CHAT_ENCRYPTION_KEY;
    process.env.NATIONAL_ID_ENCRYPTION_KEY = '11'.repeat(32);
  });
  afterAll(() => {
    process.env = saved;
  });

  it('round-trips, and never stores the text readably', () => {
    const sealed = encryptChatContent('BP 180/110 for patient AKM-0042', scope);
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('180/110');
    expect(decryptChatContent(sealed, scope)).toBe('BP 180/110 for patient AKM-0042');
  });

  it('uses a fresh IV, so the same text never seals the same way twice', () => {
    expect(encryptChatContent('hello', scope)).not.toBe(encryptChatContent('hello', scope));
  });

  it('refuses a ciphertext moved to another conversation or clinic', () => {
    const sealed = encryptChatContent('hello', scope);
    expect(() => decryptChatContent(sealed, { ...scope, conversationId: 'conv-2' })).toThrow();
    expect(() => decryptChatContent(sealed, { ...scope, clinicId: 'clinic-2' })).toThrow();
  });

  it('refuses a tampered ciphertext', () => {
    const sealed = encryptChatContent('hello', scope);
    const flipped = `${sealed.slice(0, -2)}${sealed.at(-2) === 'A' ? 'B' : 'A'}${sealed.at(-1)}`;
    expect(() => decryptChatContent(flipped, scope)).toThrow();
  });

  it('prefers a dedicated chat key over the national ID key', () => {
    const sealed = encryptChatContent('hello', scope);
    process.env.CHAT_ENCRYPTION_KEY = '22'.repeat(32);
    expect(() => decryptChatContent(sealed, scope)).toThrow();
  });

  it('reads legacy plaintext as is, and a broken row as a placeholder', () => {
    expect(readChatContent({ content: 'old', encrypted: false }, scope)).toBe('old');
    const onError = jest.fn();
    expect(readChatContent({ content: 'v1.garbage', encrypted: true }, scope, onError)).toBe(
      UNREADABLE_MESSAGE,
    );
    expect(onError).toHaveBeenCalled();
  });

  it('fails closed without a key', () => {
    delete process.env.NATIONAL_ID_ENCRYPTION_KEY;
    expect(() => encryptChatContent('hello', scope)).toThrow(/must be set/);
  });
});
