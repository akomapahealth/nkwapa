'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { AppActionRow } from '@/components/app-shell/AppActionRow';
import { Button } from '@/components/ui/button';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getTodayInTimeZone, hasPermission, type ActiveShiftsResponse } from '@/lib/ops';
import { fetchActiveShifts } from '@/lib/ops-api';
import { overlayPendingShifts } from '@/lib/ops-offline';
import { fetchStationBoard, isStationBoard, usePolling, type StationBoard } from '@/lib/stations';
import { useOpsView } from '@/lib/use-ops-view';
import { usePendingOpsWrites } from '@/lib/use-pending-ops-writes';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { cn } from '@/lib/utils';
import { AlsoOnYourPlate, workRows } from './NeedsYouNow';
import { HapDraftsList } from './HapDraftsList';
import type { DashboardData } from './RoleHome';

interface StationsView {
  board: StationBoard;
  shifts: ActiveShiftsResponse;
}
function isStationsView(value: unknown): value is StationsView {
  if (!value || typeof value !== 'object') return false;
  const view = value as Partial<StationsView>;
  return isStationBoard(view.board) && Array.isArray(view.shifts?.items);
}

/** The volunteer's next actions, sharing the Stations page's existing offline view contract. */
export function VolunteerClinicDay({
  clinicId,
  volunteer,
  worklistHref,
}: {
  clinicId: string;
  volunteer: DashboardData['volunteer'];
  worklistHref: string | null;
}) {
  const bootstrap = useBootstrap()?.bootstrap;
  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const showLine =
    isWebFeatureEnabled('stationWorkflow') &&
    hasPermission(permissions, 'OPS.STATION.READ') &&
    hasPermission(permissions, 'OPS.SHIFT.READ');
  const [date] = useState(getTodayInTimeZone);
  const pending = usePendingOpsWrites(clinicId);
  const pendingIds = useMemo(() => pending.map((write) => write.entityId), [pending]);
  const view = useOpsView<StationsView>({
    clinicId: showLine ? clinicId : null,
    kind: 'station-workspace',
    date,
    pendingIds,
    isValid: isStationsView,
    errorMessage: 'The station line could not be loaded.',
    fetcher: async (getToken, signal) => {
      const [board, shifts] = await Promise.all([
        fetchStationBoard(clinicId, date, getToken, signal),
        fetchActiveShifts({ clinicId, date, getToken, signal }),
      ]);
      return { board, shifts };
    },
  });
  usePolling(view.refresh, showLine && view.isOnline);
  const shifts = useMemo(
    () =>
      overlayPendingShifts(view.data?.shifts.items ?? [], pending, {
        userId: bootstrap?.userId,
        displayName: bootstrap?.displayName,
      }),
    [view.data, pending, bootstrap?.userId, bootstrap?.displayName],
  );
  const ownShift = shifts.find(
    (item) => item.userId === bootstrap?.userId && item.status === 'ACTIVE',
  );
  const shift = ownShift && !ownShift.pendingCheckOut ? ownShift : undefined;
  const rows = workRows({ volunteer, worklistHref }).map((row) =>
    row.label === 'Open drafts'
      ? { ...row, detail: 'Visits you started and have not submitted.' }
      : row,
  );
  const stations = view.data?.board.stations.filter((station) => station.active) ?? [];

  return (
    <div className="space-y-6" data-main-role="VOLUNTEER">
      {showLine ? (
        <section
          aria-labelledby="volunteer-line-title"
          className="station-line border-t-2 border-rule-strong pt-4"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="volunteer-line-title" className="type-section-title">
              The line
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/stations">Open stations</Link>
            </Button>
          </div>
          {!view.isOnline || view.savedCopyAt ? (
            <StaleDataNotice isOnline={view.isOnline} savedAt={view.savedCopyAt} />
          ) : null}
          {view.error || view.refreshError ? (
            <InlineErrorState
              title="Station line refresh is affected"
              description={view.error ?? view.refreshError ?? ''}
              onRetry={view.refresh}
            />
          ) : null}
          {view.isInitialLoading ? (
            <SectionSkeleton lines={2} />
          ) : view.data ? (
            stations.length ? (
              <ol
                className="station-route station-route-compact"
                aria-label="Clinic stations"
                tabIndex={0}
              >
                {stations.map((station) => {
                  const waiting = station.visits.filter(
                    (visit) => visit.status === 'QUEUED',
                  ).length;
                  const seen = station.visits.filter(
                    (visit) => visit.status === 'IN_PROGRESS',
                  ).length;
                  const mine = station.staff.some((member) => member.id === bootstrap?.userId);
                  return (
                    <li key={station.id} aria-current={mine ? 'location' : undefined}>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'station-route-stop',
                          waiting + seen > 0 && 'station-route-stop-busy',
                          mine && 'station-route-stop-mine',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">
                          <strong className="font-mono text-xl font-semibold text-foreground">
                            {waiting}
                          </strong>{' '}
                          waiting
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {station.name}
                          {mine ? ' · you' : ''}
                        </p>
                        {seen > 0 ? (
                          <p className="mt-1 text-sm text-muted-foreground">{seen} being seen</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                No stations are open for this clinic day.
              </p>
            )
          ) : null}
        </section>
      ) : null}
      <section
        aria-labelledby="volunteer-clinic-day"
        className="border-t-2 border-rule-strong pt-4"
      >
        <h2 id="volunteer-clinic-day" className="type-section-title">
          Your clinic day
        </h2>
        {volunteer ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Today you added {volunteer.patientsRegisteredToday}{' '}
            {volunteer.patientsRegisteredToday === 1 ? 'patient' : 'patients'} and started{' '}
            {volunteer.encountersCreatedToday}{' '}
            {volunteer.encountersCreatedToday === 1 ? 'visit' : 'visits'}.
          </p>
        ) : null}
        <ul className="mt-2">
          {showLine ? (
            <AppActionRow
              icon={shift ? CheckCircle2 : Clock3}
              title={
                ownShift?.pendingCheckOut
                  ? 'Your shift is ending'
                  : shift
                    ? 'Your shift is active'
                    : view.data
                      ? 'Start your shift'
                      : 'Check your shift'
              }
              detail={
                ownShift?.pendingSync
                  ? 'Saved on this device, waiting to sync.'
                  : shift
                    ? 'Choose a station and take a patient.'
                    : 'Use the shift controls above.'
              }
              action={
                <Button asChild variant="ghost">
                  <Link href="#volunteer-shift-controls">Shift controls</Link>
                </Button>
              }
            />
          ) : null}
          {rows.map(({ href, label, ...row }) => (
            <AppActionRow
              key={row.title}
              {...row}
              action={
                href ? (
                  <Button asChild variant="outline">
                    <Link href={href}>{label === 'Open Stations' ? 'Open stations' : label}</Link>
                  </Button>
                ) : undefined
              }
            />
          ))}
          {volunteer && volunteer.pendingSubmissions === 0 ? (
            <AppActionRow
              icon={CheckCircle2}
              title="No draft visits to submit"
              detail="Visits you start will appear here until submitted."
            />
          ) : null}
        </ul>
        {volunteer?.clinicalNotes && volunteer.clinicalNotes.drafts > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-sm text-muted-foreground">
              {volunteer.clinicalNotes.drafts} HAP{' '}
              {volunteer.clinicalNotes.drafts === 1 ? 'draft' : 'drafts'} to continue
            </p>
            <HapDraftsList clinicId={clinicId} />
          </div>
        ) : null}
      </section>
      <AlsoOnYourPlate rows={[]} />
    </div>
  );
}
