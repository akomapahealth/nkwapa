'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export type InboxKind =
  | 'MESSAGE'
  | 'COSIGN'
  | 'ASSIGNMENT'
  | 'HEALTH_ALERT'
  | 'APPOINTMENT_REQUEST'
  | 'INVITE'
  | 'REMINDER_FAILED';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  body: string | null;
  url: string;
  /** How many events the tile stands for, e.g. three messages in one chat. */
  count: number;
  clinicId: string | null;
  updatedAt: string;
  readAt: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  unreadCount: number;
  nextBefore: string | null;
}

/** Fired after this tab marks something read, so the bell updates without waiting for a poll. */
export const INBOX_CHANGED_EVENT = 'nkwapa:inbox-changed';
const POLL_MS = 60_000;

type GetToken = ReturnType<typeof useAuth>;

export async function fetchInbox(getToken: GetToken, before?: string): Promise<InboxPage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  const response = await apiFetch(`/me/notifications${query}`, {
    getToken,
    skipClinicHeader: true,
  });
  if (!response.ok) throw new Error(`Notifications could not be loaded (${response.status}).`);
  return (await response.json()) as InboxPage;
}

/** Mark the given notifications read, or every unread one when `ids` is omitted. */
export async function markInboxRead(getToken: GetToken, ids?: string[]): Promise<void> {
  const response = await apiFetch('/me/notifications/read', {
    getToken,
    skipClinicHeader: true,
    method: 'POST',
    body: JSON.stringify(ids ? { ids } : {}),
  });
  if (!response.ok) throw new Error(`Could not mark notifications read (${response.status}).`);
  window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
}

/**
 * The bell's number. Polls once a minute while the tab is visible and online, and re-reads on
 * focus and after this tab marks something read. Offline it keeps the last number it had.
 */
export function useUnreadNotificationCount(): number {
  const getToken = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const response = await apiFetch('/me/notifications/unread-count', {
        getToken,
        skipClinicHeader: true,
      });
      if (response.ok) setCount(((await response.json()) as { unreadCount: number }).unreadCount);
    } catch {
      // The bell is a courtesy: a failed read keeps the last count.
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onChange = () => void refresh();
    window.addEventListener('focus', onChange);
    window.addEventListener(INBOX_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onChange);
      window.removeEventListener(INBOX_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, [refresh]);

  return count;
}
