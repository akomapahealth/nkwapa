'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { OPS_DEFAULT_TIMEZONE, formatOpsDateTime, getTodayInTimeZone } from '@/lib/ops';
import { useOpsView } from '@/lib/use-ops-view';
import {
  cancelCheckIn,
  fetchStationBoard,
  minutesSince,
  moveCheckIn,
  patientName,
  releaseStationVisit,
  usePolling,
  type StationBoard,
  type StationVisit,
} from '@/lib/stations';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice, OfflineOpsBanner } from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type Override = { kind: 'move' | 'release' | 'left'; visit: StationVisit };

/**
 * The manager's view of the station line (#167): every station, who is working it, who is waiting
 * and who is being seen. A manager does not assign patients here; they unblock the line by moving
 * a patient, releasing a claim someone left open, or recording that a patient left.
 */
export function StationLineBoard() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canManage = perms.includes('*') || perms.includes('OPS.STATION.MANAGE');
  const [date, setDate] = useState(getTodayInTimeZone());
  const [override, setOverride] = useState<Override | null>(null);
  const [reason, setReason] = useState('');
  const [targetStationId, setTargetStationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = useOpsView<StationBoard>({
    clinicId,
    kind: 'station-board',
    date,
    errorMessage: 'The station line could not be loaded.',
    fetcher: (token, signal) => fetchStationBoard(clinicId ?? '', date, token, signal),
  });
  const { isOnline, refresh } = view;
  const isToday = date === getTodayInTimeZone(view.data?.timezone ?? OPS_DEFAULT_TIMEZONE);
  usePolling(refresh, isOnline && isToday && Boolean(clinicId));
  const timezone = view.data?.timezone ?? OPS_DEFAULT_TIMEZONE;
  const stations = (view.data?.stations ?? []).filter(
    (station) => station.active || station.visits.length > 0,
  );

  const close = () => {
    setOverride(null);
    setReason('');
    setTargetStationId('');
  };

  const apply = useCallback(async () => {
    if (!override || !clinicId || !getToken || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (override.kind === 'move') {
        await moveCheckIn(
          clinicId,
          override.visit.checkInId,
          targetStationId,
          reason.trim(),
          getToken,
        );
      } else if (override.kind === 'release') {
        await releaseStationVisit(clinicId, override.visit.id, reason.trim(), getToken, {
          force: true,
        });
      } else {
        await cancelCheckIn(clinicId, override.visit.checkInId, reason.trim(), getToken);
      }
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
      refresh();
    }
  }, [override, clinicId, getToken, reason, targetStationId, refresh]);

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Clinic ops"
        title="Station line"
        description="Where every checked-in patient is, and who is seeing them."
        actions={
          <div className="flex items-end gap-3">
            <Input
              type="date"
              aria-label="Clinic day"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-[180px]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={!isOnline || view.isRefreshing}
            >
              <RefreshCw
                aria-hidden="true"
                className={view.isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}
              />
              Refresh
            </Button>
          </div>
        }
      />

      {!isOnline ? (
        <OfflineOpsBanner
          dataAsOf={view.dataAsOf}
          timeZone={timezone}
          unavailable="Moving patients and releasing claims"
        />
      ) : null}
      {view.error ? (
        <InlineErrorState
          title="The station line could not be loaded"
          description={view.error}
          onRetry={refresh}
        />
      ) : null}
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      {view.isInitialLoading ? (
        <SectionSkeleton lines={6} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {stations.map((station) => (
            <Card key={station.id} className="min-w-0">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="text-base">{station.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {station.staff.length
                    ? station.staff.map((member) => member.displayName).join(', ')
                    : 'Nobody at this station'}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {station.visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Empty</p>
                ) : (
                  station.visits.map((visit) => (
                    <div key={visit.id} className="space-y-2 rounded-lg border p-2 text-sm">
                      <div>
                        <p className="font-medium">{patientName(visit.patient)}</p>
                        <p className="text-xs text-muted-foreground">{visit.patient.patientCode}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {visit.status === 'IN_PROGRESS' ? (
                          <Badge variant="default">With {visit.claimedBy?.displayName}</Badge>
                        ) : (
                          <Badge variant="secondary">Waiting</Badge>
                        )}
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {minutesSince(visit.claimedAt ?? visit.queuedAt)} min
                        </span>
                      </div>
                      {canManage && isToday ? (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!isOnline}
                            onClick={() => setOverride({ kind: 'move', visit })}
                          >
                            Move
                          </Button>
                          {visit.status === 'IN_PROGRESS' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!isOnline}
                              onClick={() => setOverride({ kind: 'release', visit })}
                            >
                              Release
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!isOnline}
                            onClick={() => setOverride({ kind: 'left', visit })}
                          >
                            Left
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/stations/visits/${visit.id}`}>Open</Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Times shown in {timezone}.
        {view.dataAsOf ? ` Updated ${formatOpsDateTime(view.dataAsOf, timezone)}.` : ''}
      </p>

      <Dialog open={override !== null} onOpenChange={(open) => (!open ? close() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {override?.kind === 'move'
                ? 'Move patient'
                : override?.kind === 'release'
                  ? 'Release claim'
                  : 'Patient left'}
            </DialogTitle>
            <DialogDescription>
              {override ? patientName(override.visit.patient) : ''}. A reason is recorded in the
              audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {override?.kind === 'move' ? (
              <div className="space-y-2">
                <Label htmlFor="move-station">Send to</Label>
                <Select value={targetStationId} onValueChange={setTargetStationId}>
                  <SelectTrigger id="move-station">
                    <SelectValue placeholder="Choose a station" />
                  </SelectTrigger>
                  <SelectContent>
                    {stations
                      .filter((station) => station.active)
                      .map((station) => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="override-reason">Reason</Label>
              <Input
                id="override-reason"
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !reason.trim() || (override?.kind === 'move' && !targetStationId)}
              onClick={() => void apply()}
            >
              {busy ? 'Working…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
