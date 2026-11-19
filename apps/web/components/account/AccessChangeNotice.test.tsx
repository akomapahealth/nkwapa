/**
 * @jest-environment jsdom
 */
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

const fetchInbox = jest.fn();
const markInboxRead = jest.fn().mockResolvedValue(undefined);
const refetch = jest.fn();
jest.mock('@/lib/inbox', () => ({
  INBOX_UNREAD_EVENT: 'nkwapa:inbox-unread',
  fetchInbox: (...args: unknown[]) => fetchInbox(...args),
  markInboxRead: (...args: unknown[]) => markInboxRead(...args),
}));
jest.mock('@/lib/auth-context', () => ({ useAuth: () => async () => 'token' }));
jest.mock('@/lib/browser-notifications', () => ({ OPEN_CHAT_EVENT: 'nkwapa:open-chat' }));
jest.mock('@/lib/bootstrap-context', () => ({
  useBootstrap: () => ({
    refetch,
    bootstrap: {
      activeClinicId: 'c1',
      memberships: [{ clinicId: 'c1', clinicName: 'Cape Coast Clinic', roles: ['DOCTOR'] }],
      globalRoles: [],
      effectivePermissionsForActiveClinic: ['PATIENT.SEARCH', 'CHAT.SEND'],
    },
  }),
}));
// Radix portals and focus traps are not under test; the notice's own logic is.
jest.mock('@/components/ui/dialog', () => {
  const part = ({ children }: { children?: ReactNode }) => children ?? null;
  return {
    Dialog: part,
    DialogContent: part,
    DialogHeader: part,
    DialogFooter: part,
    DialogTitle: part,
    DialogDescription: part,
  };
});

import { AccessChangeNotice } from './AccessChangeNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (over: Record<string, unknown>) => ({
  id: 'n1',
  kind: 'ACCESS_CHANGE',
  title: 'You now have the Doctor role at Cape Coast Clinic',
  body: 'Added by Ama.',
  url: '/account?changedBy=admin-1',
  count: 1,
  clinicId: null,
  updatedAt: '2026-11-14T10:00:00Z',
  readAt: null,
  ...over,
});

const unread = (unreadCount: number) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent('nkwapa:inbox-unread', { detail: { unreadCount } }));
    await Promise.resolve();
    await Promise.resolve();
  });

describe('AccessChangeNotice', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(async () => {
    jest.clearAllMocks();
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    await act(async () => root.render(createElement(AccessChangeNotice)));
  });
  // Unmount, not only detach: a mounted notice keeps listening on window.
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('shows nothing for ordinary notifications', async () => {
    fetchInbox.mockResolvedValue({ items: [item({ kind: 'MESSAGE' })] });
    await unread(1);
    expect(host.textContent).toBe('');
    expect(refetch).not.toHaveBeenCalled();
  });

  it('announces an unread access change, reloads identity, and marks it read on dismissal', async () => {
    fetchInbox.mockResolvedValue({ items: [item({}), item({ id: 'old', readAt: 'x' })] });
    await unread(1);

    expect(host.textContent).toContain('Your access has changed');
    expect(host.textContent).toContain('You now have the Doctor role at Cape Coast Clinic');
    expect(host.textContent).toContain('What you can do at Cape Coast Clinic');
    expect(host.textContent).toContain('Find a patient');
    expect(refetch).toHaveBeenCalledTimes(1);

    const opened: unknown[] = [];
    window.addEventListener('nkwapa:open-chat', (event) =>
      opened.push((event as CustomEvent).detail),
    );
    const buttons = [...host.querySelectorAll('button')];
    await act(async () => buttons.find((b) => /mistake/i.test(b.textContent ?? ''))?.click());

    expect(opened).toEqual([{ participantUserId: 'admin-1' }]);
    expect(markInboxRead).toHaveBeenCalledWith(expect.any(Function), ['n1']);
    expect(host.textContent).toBe('');
  });

  it('does not look again while the unread count is not rising', async () => {
    fetchInbox.mockResolvedValue({ items: [] });
    await unread(2);
    await unread(2);
    await unread(1);
    expect(fetchInbox).toHaveBeenCalledTimes(1);
  });
});
