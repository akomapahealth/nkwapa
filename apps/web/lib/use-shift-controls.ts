'use client';

import { useEffect, useState } from 'react';
import { getErrorMessage } from './api';
import { formatRoleLabel, type ActiveShift, type ShiftRole } from './ops';
import type { WithPendingSync } from './ops-offline';
import { generateClientId } from './outbox';
import { useOpsWrite } from './use-ops-write';

export type OpsFeedback = { tone: 'success' | 'info' | 'error'; message: string } | null;

/**
 * Starting and ending your own shift, shared by every page that shows the shift card.
 *
 * Works offline: the change is queued and drawn on the roster as pending. `shifts` is the roster
 * with queued changes already drawn in, so "my shift" here is what the person last did on this
 * device, not only what the server has heard.
 */
export function useShiftControls({
  clinicId,
  userId,
  shifts,
  eligibleRoles,
  onApplied,
}: {
  clinicId: string | null;
  userId: string | null | undefined;
  shifts: readonly WithPendingSync<ActiveShift>[];
  eligibleRoles: readonly ShiftRole[];
  /** Called after the server applied a change, to reload the view. */
  onApplied: () => void;
}) {
  const submit = useOpsWrite(clinicId);
  const [selectedRole, setSelectedRole] = useState<ShiftRole | ''>('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<OpsFeedback>(null);

  // Default to the first role the person can take, and drop a role they no longer hold.
  const rolesKey = eligibleRoles.join('|');
  useEffect(() => {
    if (selectedRole && eligibleRoles.includes(selectedRole)) return;
    setSelectedRole(eligibleRoles[0] ?? '');
    // eligibleRoles is a fresh array each render; rolesKey is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesKey, selectedRole]);

  const currentShift = shifts.find((shift) => shift.userId === userId) ?? null;

  async function run(
    action: () => Promise<{ outcome: string; error?: unknown }>,
    done: {
      applied: string;
      queued: string;
    },
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await action();
      if (result.outcome === 'applied') {
        setFeedback({ tone: 'success', message: done.applied });
        onApplied();
      } else if (result.outcome === 'queued') {
        setFeedback({ tone: 'info', message: done.queued });
      } else {
        setFeedback({ tone: 'error', message: getErrorMessage(result.error) });
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function checkIn() {
    if (!submit || !selectedRole) return;
    const role = formatRoleLabel(selectedRole);
    void run(
      () =>
        submit({ kind: 'shiftCheckIn', shiftId: generateClientId(), roleAtShift: selectedRole }),
      {
        applied: `Shift started as ${role}.`,
        queued: `Shift start saved on this device as ${role}. It will sync when the connection returns.`,
      },
    );
  }

  function checkOut() {
    if (!submit || !currentShift || currentShift.pendingCheckOut) return;
    void run(
      () =>
        submit({
          kind: 'shiftCheckOut',
          shiftId: currentShift.shiftId,
          afterQueuedStart: currentShift.pendingSync !== undefined,
        }),
      {
        applied: 'Shift ended.',
        queued: 'Shift end saved on this device. It will sync when the connection returns.',
      },
    );
  }

  return {
    currentShift,
    selectedRole,
    setSelectedRole,
    busy,
    canSubmit: submit !== null,
    feedback,
    clearFeedback: () => setFeedback(null),
    checkIn,
    checkOut,
  };
}
