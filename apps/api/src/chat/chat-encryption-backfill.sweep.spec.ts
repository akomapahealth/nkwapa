import { decryptChatContent } from './chat-crypto';
import { sealLegacyMessages } from './chat-encryption-backfill.sweep';

describe('sealLegacyMessages', () => {
  beforeAll(() => {
    process.env.NATIONAL_ID_ENCRYPTION_KEY = '11'.repeat(32);
  });

  it('seals each plaintext row under its own clinic and conversation, once', async () => {
    const row = { id: 'm1', clinicId: 'clinic-1', conversationId: 'conv-1', content: 'hi' };
    const client = {
      message: {
        findMany: jest.fn().mockResolvedValue([row]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(sealLegacyMessages(client as never)).resolves.toBe(1);

    const call = client.message.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'm1', encrypted: false });
    expect(call.data.encrypted).toBe(true);
    expect(decryptChatContent(call.data.content, row)).toBe('hi');
  });
});
