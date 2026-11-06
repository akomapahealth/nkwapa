import { apiFetch, readApiError, type GetToken } from './api';

/**
 * Browser notifications, opt-in per device.
 *
 * While Nkwapa is open in a tab or an installed window, including in the background, they are
 * raised from the live chat connection. With Web Push configured (#250), turning them on also
 * subscribes this browser, so the API can reach it while Nkwapa is closed; the service worker
 * shows those. The opt-in is kept on the device because the browser's permission is per device too.
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

/**
 * Turning on asks the browser once; turning off forgets the opt-in (a page cannot revoke the
 * permission). Either way the background push subscription follows, when there is one to follow.
 */
export async function setNotificationsEnabled(
  enabled: boolean,
  getToken?: GetToken,
): Promise<NotificationState> {
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
  const state = getNotificationState();
  if (getToken) {
    await (state === 'on' ? syncPushSubscription(getToken) : removePushSubscription(getToken));
  }
  return state;
}

/** The public half of the API's VAPID key pair, baked into the build. Empty: no background push. */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? '';

/** Whether this build and browser can receive pushes while Nkwapa is closed (#250). */
export function webPushSupported(): boolean {
  return (
    VAPID_PUBLIC_KEY !== '' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** base64url, as VAPID keys are written, to the bytes pushManager.subscribe wants. */
export function vapidKeyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function pushManager(): Promise<PushManager | null> {
  if (!webPushSupported()) return null;
  // No registration in `next dev` unless asked for: then there is nothing to push to.
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager ?? null;
}

/**
 * Subscribe this browser for the signed-in person and tell the API. Also run on each sign-in while
 * the opt-in is on: the browser may have rotated the subscription, or someone else may have signed
 * in on this device since. Best effort: notifications in an open app work without it.
 */
export async function syncPushSubscription(getToken: GetToken): Promise<boolean> {
  try {
    const manager = await pushManager();
    if (!manager) return false;
    const subscription =
      (await manager.getSubscription()) ??
      (await manager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(VAPID_PUBLIC_KEY),
      }));
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) return false;
    const response = await apiFetch('/me/push-subscriptions', {
      method: 'PUT',
      body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
      getToken,
      skipClinicHeader: true,
    });
    if (!response.ok) throw await readApiError(response);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop background pushes to this browser: the API forgets it and the browser drops the
 * subscription. Run on turning notifications off and on signing out, because clinic devices are
 * shared and the next person must not receive the last one's notifications.
 */
export async function removePushSubscription(getToken?: GetToken): Promise<void> {
  try {
    const subscription = await (await pushManager())?.getSubscription();
    if (!subscription) return;
    if (getToken) {
      await apiFetch('/me/push-subscriptions/remove', {
        method: 'POST',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        getToken,
        skipClinicHeader: true,
      });
    }
    await subscription.unsubscribe();
  } catch {
    // Best effort. A subscription left behind is dropped by the API the first time it bounces.
  }
}

/** On sign-out: no background pushes here, and the next person to sign in chooses for themselves. */
export async function forgetNotificationsOnDevice(getToken?: GetToken): Promise<void> {
  await removePushSubscription(getToken);
  try {
    window.localStorage.removeItem(NOTIFICATION_OPT_IN_KEY);
  } catch {
    // Storage blocked: the opt-in already reads as off.
  }
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
