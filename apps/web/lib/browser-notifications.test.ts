import { chatNotificationUrl, shouldNotifyChat } from './browser-notifications';

describe('shouldNotifyChat', () => {
  it('stays quiet unless the person opted in on this device', () => {
    for (const state of ['unsupported', 'denied', 'off'] as const) {
      expect(shouldNotifyChat({ state, pageVisible: false, conversationOpen: false })).toBe(false);
    }
  });

  it('notifies when the tab is hidden, even with the conversation open', () => {
    expect(shouldNotifyChat({ state: 'on', pageVisible: false, conversationOpen: true })).toBe(
      true,
    );
  });

  it('notifies on a visible page about a conversation that is not open', () => {
    expect(shouldNotifyChat({ state: 'on', pageVisible: true, conversationOpen: false })).toBe(
      true,
    );
  });

  it('does not notify about the conversation the person is reading', () => {
    expect(shouldNotifyChat({ state: 'on', pageVisible: true, conversationOpen: true })).toBe(
      false,
    );
  });
});

describe('chatNotificationUrl', () => {
  it('keeps the current page and its query, naming the conversation', () => {
    expect(chatNotificationUrl('https://app.example/patients?q=ama&chat=old', 'conv-1')).toBe(
      '/patients?q=ama&chat=conv-1',
    );
  });
});
