'use client';

import { CloudOff } from 'lucide-react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { cn } from '@/lib/utils';

export interface PortalWriteGate {
  canWrite: boolean;
  /** Why the action is unavailable, for helper text and the control's `title`. */
  reason: string | null;
}

export const PORTAL_OFFLINE_WRITE_REASON =
  'You are offline. Sending this needs a connection, and nothing is kept on this device to send later.';

export const PORTAL_SAVED_COPY_WRITE_REASON =
  'You are looking at a saved copy. Refresh to see your latest details before asking for a change.';

/** Said above a saved copy while offline: what on the portal still needs a connection. */
export const PORTAL_OFFLINE_DETAIL =
  'Logging readings and sending appointment requests need a connection.';

/** Said offline when this device has no saved copy of the view to show. */
export const PORTAL_NO_SAVED_COPY =
  'This page has not been saved on this device yet. It will load as soon as you are back online.';

/**
 * Whether a portal write can be attempted right now (#18).
 *
 * Portal writes are online-only: nothing is queued, so a patient is never left wondering whether
 * a reading or a request reached the clinic. A change to something shown from a saved copy is
 * also held back, because the appointment it names may already have moved.
 */
export function usePortalWriteGate(view?: { savedCopyAt?: string | null }): PortalWriteGate {
  const { isOnline } = useSync();
  if (!isOnline) return { canWrite: false, reason: PORTAL_OFFLINE_WRITE_REASON };
  if (view?.savedCopyAt) return { canWrite: false, reason: PORTAL_SAVED_COPY_WRITE_REASON };
  return { canWrite: true, reason: null };
}

/** The reason a form cannot be sent, said beside it rather than only on a disabled button. */
export function PortalWriteGateNotice({
  gate,
  className,
}: {
  gate: PortalWriteGate;
  className?: string;
}) {
  if (gate.canWrite || !gate.reason) return null;
  return (
    <InlineNotice tone="warning" className={cn('flex items-start gap-3', className)}>
      <CloudOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="leading-6" data-testid="portal-write-gate">
        {gate.reason}
      </p>
    </InlineNotice>
  );
}
