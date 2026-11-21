import {
  chatNotificationUrl,
  shouldNotifyChat,
  shouldOfferNotificationPrompt,
} from './browser-notifications';

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

describe('shouldOfferNotificationPrompt', () => {
  it('offers once, in the installed app, while notifications are off', () => {
    expect(shouldOfferNotificationPrompt({ installed: true, state: 'off', prompted: false })).toBe(
      true,
    );
  });

  it('never offers in a browser tab, which keeps the choice in Account', () => {
    expect(shouldOfferNotificationPrompt({ installed: false, state: 'off', prompted: false })).toBe(
      false,
    );
  });

  it('does not ask again after asking since this sign-in', () => {
    expect(shouldOfferNotificationPrompt({ installed: true, state: 'off', prompted: true })).toBe(
      false,
    );
  });

  it('stays quiet when they are on, blocked, or impossible on this device', () => {
    for (const state of ['on', 'denied', 'unsupported'] as const) {
      expect(shouldOfferNotificationPrompt({ installed: true, state, prompted: false })).toBe(
        false,
      );
    }
  });
});
