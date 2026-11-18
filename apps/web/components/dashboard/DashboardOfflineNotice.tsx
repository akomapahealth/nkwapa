import Link from 'next/link';
import { CloudOff } from 'lucide-react';
import { InlineNotice } from '@/components/feedback/InlineNotice';

/**
 * The dashboard offline (OFF-01). Its figures come from the API and are not kept on the device,
 * so offline is expected, not an error: say what still works and link to it.
 */
export function DashboardOfflineNotice({
  loadedAt,
  worklistHref,
  patientsHref,
}: {
  /** When the figures on screen were loaded, or null when none are. */
  loadedAt: Date | null;
  worklistHref: string | null;
  patientsHref: string;
}) {
  return (
    <InlineNotice tone="warning" live={false} className="flex items-start gap-3">
      <CloudOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1" data-testid="dashboard-offline-notice">
        <p className="font-medium">Dashboard figures need a connection.</p>
        <p className="text-sm text-current/80">
          Patients and charts opened on this device still work offline, and visits you save sync
          when you reconnect.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          {worklistHref ? (
            <Link href={worklistHref} className="underline underline-offset-2">
              Open your worklist
            </Link>
          ) : null}
          <Link href={patientsHref} className="underline underline-offset-2">
            Open patients
          </Link>
        </p>
        {loadedAt ? (
          <p className="text-xs text-current/70">
            Showing what this page loaded at{' '}
            {loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
          </p>
        ) : null}
      </div>
    </InlineNotice>
  );
}
