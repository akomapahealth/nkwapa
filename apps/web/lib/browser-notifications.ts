/**
 * Browser notifications, opt-in per device.
 *
 * Shown while Nkwapa is open in a tab or an installed window, including in the background: they
 * are raised from the live chat connection, not from a push server, so a fully closed app gets
 * none. The opt-in is kept on the device because the browser's permission is per device too.
 *
 * A notification says who, never what. Chat can carry patient details, and a notification lands
 * on a lock screen anyone can read.
 */

export const NOTIFICATION_OPT_IN_KEY = 'nkwapa.notifications.enabled';
/** Posted by the service worker when a notification is clicked; the page navigates. */
export const NOTIFICATION_CLICK_MESSAGE = 'NKWAPA_NOTIFICATION_CLICK';
/** Asks the chat panel to open a conversation, from anywhere in the page. */
export const OPEN_CHAT_EVENT = 'nkwapa:open-chat';
/** The query parameter a cold-opened window carries to name the conversation to open. */
export const CHAT_QUERY_PARAM = 'chat';

export type NotificationState = 'unsupported' | 'denied' | 'off' | 'on';

export interface AppNotification {
  title: string;
  body?: string;
  /** Where clicking it goes. */
  url: string;
  /** Repeats with the same tag replace each other instead of stacking. */
  tag?: string;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function readOptIn(): boolean {
  try {
    return window.localStorage.getItem(NOTIFICATION_OPT_IN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function getNotificationState(): NotificationState {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && readOptIn() ? 'on' : 'off';
}

/** Turning on asks the browser once; turning off only forgets the opt-in (a page cannot revoke). */
export async function setNotificationsEnabled(enabled: boolean): Promise<NotificationState> {
  if (!notificationsSupported()) return 'unsupported';
  if (enabled && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  try {
    window.localStorage.setItem(
      NOTIFICATION_OPT_IN_KEY,
      String(enabled && Notification.permission === 'granted'),
    );
  } catch {
    // Storage blocked: the state below reads as off, which is the honest answer.
  }
  return getNotificationState();
}

/**
 * Whether a chat message should raise a notification: opted in, and not already in front of
 * the person (the tab is hidden, or that conversation is not the one open).
 */
export function shouldNotifyChat({
  state,
  pageVisible,
  conversationOpen,
}: {
  state: NotificationState;
  pageVisible: boolean;
  conversationOpen: boolean;
}): boolean {
  return state === 'on' && !(pageVisible && conversationOpen);
}

/** The URL a chat notification opens: this page, with the conversation named. */
export function chatNotificationUrl(currentHref: string, conversationId: string): string {
  const url = new URL(currentHref);
  url.searchParams.set(CHAT_QUERY_PARAM, conversationId);
  return `${url.pathname}${url.search}`;
}

/**
 * Show a notification. Through the service worker when one is active, which installed apps and
 * Android require and which lets a click reach a window that has since closed; otherwise directly.
 */
export async function showAppNotification(notification: AppNotification): Promise<void> {
  if (getNotificationState() !== 'on') return;
  const options: NotificationOptions = {
    body: notification.body,
    tag: notification.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: notification.url },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.active) {
      await registration.showNotification(notification.title, options);
      return;
    }
    const shown = new Notification(notification.title, options);
    shown.onclick = () => {
      window.focus();
      openNotificationUrl(notification.url);
      shown.close();
    };
  } catch {
    // A notification is a courtesy; failing to show one must never break the page.
  }
}

/**
 * Act on a clicked notification inside the page. A chat link opens the conversation where the
 * person already is; anything else is a navigation.
 */
export function openNotificationUrl(url: string, navigate?: (url: string) => void): void {
  const target = new URL(url, window.location.origin);
  const conversationId = target.searchParams.get(CHAT_QUERY_PARAM);
  if (conversationId) {
    window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { conversationId } }));
    return;
  }
  if (navigate) navigate(`${target.pathname}${target.search}`);
  else window.location.assign(target.href);
}
