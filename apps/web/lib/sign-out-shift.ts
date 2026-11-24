import { chooseAction } from '@/components/ui/confirm-dialog';
import { apiFetch, type GetToken } from './api';
import { getStoredActiveClinicId } from './bootstrap-storage';
import { getSignedInUserId } from './offline-session/bootstrap';
import { formatOpsTime, formatRoleLabel, getTodayInTimeZone } from './ops';
import { fetchActiveShifts } from './ops-api';
import { submitOpsWrite } from './ops-writes';

/** Sign-out must not hang on a slow line just to look for a shift. */
const SHIFT_LOOKUP_BUDGET_MS = 4_000;

/**
 * Before signing out, offer to end a shift still running (#425). A shift left open keeps the
 * person on the board, and the staffing counts wrong, until the stale-day sweep ends it.
 *
 * Resolves false when the person cancels, so sign-out stops. It never ends a shift without
 * asking: someone sharing a device may sign out only to let a colleague in.
 *
 * shortcut: it asks the server, so a shift whose start is still queued on this device is not
 * seen, and the offline-session "sign out" (a lock, not a sign-out) never asks. Read the
 * device's roster copy here if shifts started offline turn out to be left open.
 */
export async function settleShiftBeforeSignOut(getToken: GetToken): Promise<boolean> {
  const signal = AbortSignal.timeout(SHIFT_LOOKUP_BUDGET_MS);
  const me = await whoIsSigningOut(getToken, signal).catch(() => null);
  if (!me) return true;
  const { clinicId, userId } = me;

  const shift = await fetchActiveShifts({
    clinicId,
    date: getTodayInTimeZone(),
    getToken,
    signal,
  })
    .then((active) =>
      active.items.find((item) => item.userId === userId && item.status === 'ACTIVE'),
    )
    // Patients, and staff with no shift access, are refused: nothing to ask about.
    .catch(() => undefined);
  if (!shift) return true;

  const choice = await chooseAction({
    title: 'End your shift too?',
    description: `You are still on shift as ${formatRoleLabel(shift.roleAtShift)} since ${formatOpsTime(shift.checkedInAt)}. End your shift and sign out? Sign out only if you are handing this device to a colleague and still working.`,
    confirmLabel: 'End shift and sign out',
    alternativeLabel: 'Sign out only',
    cancelLabel: 'Cancel',
    destructive: false,
  });
  if (choice === 'cancel') return false;
  if (choice === 'confirm') {
    // Sent before the session is cleared. Unanswered, it waits in the outbox, which sign-out
    // keeps, and goes with this person's next sign-in. A refusal (already ended) is no reason
    // to keep them signed in.
    await submitOpsWrite(
      { kind: 'shiftCheckOut', shiftId: shift.shiftId },
      { clinicId, getToken, isOnline: navigator.onLine, actor: { userId } },
    ).catch(() => undefined);
  }
  return true;
}

/**
 * Who is signing out, and at which clinic. Known once the workspace has loaded; a Log out pressed
 * before that (a slow line, a quick tap) asks the server rather than skipping the question.
 */
async function whoIsSigningOut(
  getToken: GetToken,
  signal: AbortSignal,
): Promise<{ clinicId: string; userId: string } | null> {
  const clinicId = getStoredActiveClinicId();
  const userId = getSignedInUserId();
  if (clinicId && userId) return { clinicId, userId };
  const response = await apiFetch('/auth/whoami', { getToken, skipClinicHeader: true, signal });
  if (!response.ok) return null;
  const whoami = (await response.json()) as { userId: string; activeClinicId: string | null };
  return whoami.activeClinicId ? { clinicId: whoami.activeClinicId, userId: whoami.userId } : null;
}
