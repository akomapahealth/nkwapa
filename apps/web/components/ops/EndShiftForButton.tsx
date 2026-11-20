'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { showToast } from '@/components/ui/toast';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * A manager, director or system admin ends someone else's shift (#385). Online only: the person
 * may still be working, so a lead acts on what the server says now, not on a saved board.
 */
export function EndShiftForButton({
  clinicId,
  shiftId,
  displayName,
  isOnline,
  onEnded,
}: {
  clinicId: string;
  shiftId: string;
  displayName: string;
  isOnline: boolean;
  onEnded: () => void;
}) {
  const getToken = useAuth();
  const [busy, setBusy] = useState(false);

  const end = async () => {
    const confirmed = await confirmAction({
      title: `End ${displayName}’s shift?`,
      description: `${displayName} goes off duty now and any station they hold is released. They are told in Nkwapa, and the audit log records that you ended it.`,
      confirmLabel: 'End shift',
    });
    if (!confirmed || !getToken) return;
    setBusy(true);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/shifts/${encodeURIComponent(shiftId)}/end`,
        { method: 'POST', getToken, activeClinicId: clinicId },
      );
      if (!res.ok) throw await readApiError(res);
      showToast({ title: `${displayName}’s shift ended`, tone: 'success' });
      onEnded();
    } catch (error) {
      showToast({
        title: 'The shift was not ended',
        description: getErrorMessage(error),
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="primaryOutline"
      size="sm"
      disabled={!isOnline || busy}
      onClick={() => void end()}
    >
      {busy ? 'Ending…' : 'End shift'}
      <span className="sr-only"> for {displayName}</span>
    </Button>
  );
}
