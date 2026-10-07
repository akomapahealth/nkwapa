'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, History } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { db, type DiabetesScreeningRecord, type VitalsRecord } from '@/lib/db';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { OPS_DEFAULT_TIMEZONE, formatOpsDateTime } from '@/lib/ops';
import { isFullySynced } from '@/lib/sync';
import {
  cancelCheckIn,
  claimStationVisit,
  completeStationVisit,
  fetchStationVisit,
  fetchStations,
  patientName,
  releaseStationVisit,
  stationsPassedOver,
  suggestedNextStation,
  type ClinicStation,
  type StationVisit,
  type StationVisitDetail,
} from '@/lib/stations';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { InlineNotice } from '@/components/ops/OpsShared';
import { VitalsForm } from '@/components/VitalsForm';
import { MedicalHistoryPanel } from '@/components/patients/MedicalHistoryPanel';
import { ClinicalNotePanel } from '@/components/clinical-notes/ClinicalNotePanel';
import { GlucoseReadingForm } from '@/components/stations/GlucoseReadingForm';
import { CounsellingForm } from '@/components/stations/CounsellingForm';
import { StationResultsSummary } from '@/components/stations/StationResultsSummary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EncounterReadings {
  vitals: VitalsRecord | null;
  diabetes: DiabetesScreeningRecord | null;
}

const STATUS_LABELS: Record<StationVisit['status'], string> = {
  QUEUED: 'Waiting',
  IN_PROGRESS: 'Being seen',
  COMPLETED: 'Done',
  SKIPPED: 'Skipped',
  CANCELLED: 'Ended',
};

/** One patient at one station (#167): that station's form, then the hand-off. */
export default function StationVisitPage() {
  const params = useParams();
  const visitId = params.visitId as string;
  const router = useRouter();
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const userId = bootstrap?.userId ?? '';
  const clinicRoles = bootstrap?.memberships.find((m) => m.clinicId === clinicId)?.roles ?? [];
  const isDoctor = clinicRoles.includes('DOCTOR');
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canManage = perms.includes('*') || perms.includes('OPS.STATION.MANAGE');
  const { isOnline, syncNow } = useSync();
  const enabled = isWebFeatureEnabled('stationWorkflow');

  const [visit, setVisit] = useState<StationVisitDetail | null>(null);
  const [stations, setStations] = useState<ClinicStation[]>([]);
  const [readings, setReadings] = useState<EncounterReadings>({ vitals: null, diabetes: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadReadings = useCallback(
    async (encounterId: string) => {
      if (!getToken) return;
      try {
        const response = await apiFetch(`/encounters/${encodeURIComponent(encounterId)}`, {
          getToken,
          activeClinicId: clinicId ?? undefined,
        });
        if (!response.ok) throw new Error(String(response.status));
        const encounter = (await response.json()) as {
          vitals?: VitalsRecord | null;
          diabetesScreening?: DiabetesScreeningRecord | null;
        };
        setReadings({
          vitals: encounter.vitals ?? null,
          diabetes: encounter.diabetesScreening ?? null,
        });
      } catch {
        // Offline or unreachable: this device's copy is what the forms build on.
        const [vitals, diabetes] = await Promise.all([
          db.vitals.where('encounterId').equals(encounterId).first(),
          db.diabetes_screenings.where('encounterId').equals(encounterId).first(),
        ]);
        setReadings({ vitals: vitals ?? null, diabetes: diabetes ?? null });
      }
    },
    [getToken, clinicId],
  );

  const load = useCallback(async () => {
    if (!getToken || !clinicId || !enabled) return;
    try {
      const [detail, stationList] = await Promise.all([
        fetchStationVisit(clinicId, visitId, getToken),
        fetchStations(clinicId, getToken),
      ]);
      setVisit(detail);
      setStations(stationList.items);
      setLoadError(null);
      if (detail.encounterId) await loadReadings(detail.encounterId);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [getToken, clinicId, visitId, enabled, loadReadings]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = visit?.status === 'IN_PROGRESS' && visit.claimedBy?.id === userId;

  const run = useCallback(
    async (action: () => Promise<unknown>, after?: () => void) => {
      setBusy(true);
      setActionError(null);
      try {
        await action();
        if (after) after();
        else await load();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (!enabled) {
    return (
      <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
        <InlineNotice tone="info" live={false}>
          Stations are not turned on for this clinic.
        </InlineNotice>
      </RouteGuard>
    );
  }

  const timezone = OPS_DEFAULT_TIMEZONE;

  return (
    <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/stations">
            <ArrowLeft aria-hidden="true" /> Stations
          </Link>
        </Button>

        {loading ? (
          <SectionSkeleton lines={6} />
        ) : loadError || !visit || !clinicId ? (
          <InlineErrorState
            title="This station visit could not be loaded"
            description={
              isOnline ? (loadError ?? 'Not found.') : 'Reconnect to open a station visit.'
            }
            onRetry={() => void load()}
          />
        ) : (
          <>
            <AppPageHeader
              eyebrow={visit.station.name}
              title={patientName(visit.patient)}
              description={`${visit.patient.patientCode}${visit.patient.dob ? ` · born ${visit.patient.dob}` : ''} · checked in ${formatOpsDateTime(visit.checkedInAt, timezone)}`}
              actions={
                <Badge variant={mine ? 'default' : 'secondary'}>
                  {STATUS_LABELS[visit.status]}
                  {visit.claimedBy && visit.status === 'IN_PROGRESS'
                    ? ` · ${mine ? 'with you' : visit.claimedBy.displayName}`
                    : ''}
                </Badge>
              }
            />

            {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
            {!isOnline ? (
              <InlineNotice tone="warning" live={false}>
                You are offline. Readings still save on this device; handing the patient on waits
                for a connection.
              </InlineNotice>
            ) : null}

            {visit.status === 'QUEUED' ? (
              <InlineNotice tone="info" live={false}>
                This patient is waiting at {visit.station.name}.{' '}
                <Button
                  size="sm"
                  className="ml-2"
                  disabled={!isOnline || busy}
                  onClick={() => void run(() => claimStationVisit(clinicId, visit.id, getToken!))}
                >
                  Take patient
                </Button>
              </InlineNotice>
            ) : null}

            <Timeline timeline={visit.timeline} currentId={visit.id} timezone={timezone} />

            {mine && visit.encounterId ? (
              <StationForm
                visit={visit}
                clinicId={clinicId}
                userId={userId}
                isDoctor={isDoctor}
                readings={readings}
                timezone={timezone}
                onSaved={() => void loadReadings(visit.encounterId!)}
              />
            ) : visit.status === 'IN_PROGRESS' && !mine ? (
              <InlineNotice tone="info" live={false}>
                {visit.claimedBy?.displayName ?? 'Someone'} is seeing this patient at{' '}
                {visit.station.name}.
              </InlineNotice>
            ) : null}

            {mine ? (
              <HandOff
                visit={visit}
                stations={stations}
                busy={busy}
                isOnline={isOnline}
                onComplete={(body) =>
                  void run(
                    async () => {
                      // The next station reads what this one recorded, so it must reach the
                      // server first. A reading still queued would arrive after the hand-off.
                      const synced = await syncNow(clinicId);
                      if (!isFullySynced(synced)) {
                        throw new Error(
                          'Some readings have not reached the server yet. Check the sync status, then hand the patient on.',
                        );
                      }
                      return completeStationVisit(clinicId, visit.id, body, getToken!);
                    },
                    () => router.push('/stations'),
                  )
                }
                onRelease={(reason) =>
                  void run(
                    () => releaseStationVisit(clinicId, visit.id, reason, getToken!),
                    () => router.push('/stations'),
                  )
                }
                onPatientLeft={(reason) =>
                  void run(
                    () => cancelCheckIn(clinicId, visit.checkInId, reason, getToken!),
                    () => router.push('/stations'),
                  )
                }
              />
            ) : canManage && visit.status === 'IN_PROGRESS' ? (
              <ReasonAction
                title="Release this patient"
                description="For a claim left open by someone who has stepped away."
                label="Release"
                disabled={!isOnline || busy}
                onSubmit={(reason) =>
                  void run(() =>
                    releaseStationVisit(clinicId, visit.id, reason, getToken!, { force: true }),
                  )
                }
              />
            ) : null}
          </>
        )}
      </div>
    </RouteGuard>
  );
}

function Timeline({
  timeline,
  currentId,
  timezone,
}: {
  timeline: StationVisit[];
  currentId: string;
  timezone: string;
}) {
  const earlier = timeline.filter((stop) => stop.id !== currentId);
  if (!earlier.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5 text-primary" aria-hidden="true" />
          Earlier today
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {earlier.map((stop) => (
            <li key={stop.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {stop.station.name} · {STATUS_LABELS[stop.status]}
                {stop.completedBy ? ` · ${stop.completedBy.displayName}` : ''}
                {stop.completedAt ? ` · ${formatOpsDateTime(stop.completedAt, timezone)}` : ''}
              </p>
              {stop.handoffNote ? <p className="mt-1">{stop.handoffNote}</p> : null}
              {stop.endReason && stop.status !== 'COMPLETED' ? (
                <p className="mt-1 text-muted-foreground">Reason: {stop.endReason}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function StationForm({
  visit,
  clinicId,
  userId,
  isDoctor,
  readings,
  timezone,
  onSaved,
}: {
  visit: StationVisitDetail;
  clinicId: string;
  userId: string;
  isDoctor: boolean;
  readings: EncounterReadings;
  timezone: string;
  onSaved: () => void;
}) {
  const encounterId = visit.encounterId!;
  switch (visit.station.kind) {
    case 'INTAKE':
      return (
        <MedicalHistoryPanel
          clinicId={clinicId}
          patientId={visit.patient.id}
          userId={userId}
          canWrite
        />
      );
    case 'BLOOD_PRESSURE':
      return (
        <VitalsForm
          clinicId={clinicId}
          encounterId={encounterId}
          recordedByUserId={userId}
          initialData={readings.vitals}
          sections={['bloodPressure', 'notes']}
          onSaved={onSaved}
        />
      );
    case 'ANTHROPOMETRY':
      return (
        <VitalsForm
          clinicId={clinicId}
          encounterId={encounterId}
          recordedByUserId={userId}
          initialData={readings.vitals}
          sections={['anthropometry']}
          onSaved={onSaved}
        />
      );
    case 'GLUCOSE':
      return (
        <GlucoseReadingForm
          clinicId={clinicId}
          encounterId={encounterId}
          initialData={readings.diabetes}
          onSaved={onSaved}
        />
      );
    case 'REVIEW':
      return (
        <div className="space-y-6">
          <StationResultsSummary
            timeline={visit.timeline}
            vitals={readings.vitals}
            diabetes={readings.diabetes}
            timezone={timezone}
          />
          <CounsellingForm clinicId={clinicId} encounterId={encounterId} canEdit />
          <ClinicalNotePanel
            clinicId={clinicId}
            encounterId={encounterId}
            userId={userId}
            isDoctor={isDoctor}
          />
        </div>
      );
    default:
      return (
        <InlineNotice tone="info" live={false}>
          This station has no form of its own. Use the hand-off note to record what was done.
        </InlineNotice>
      );
  }
}

function HandOff({
  visit,
  stations,
  busy,
  isOnline,
  onComplete,
  onRelease,
  onPatientLeft,
}: {
  visit: StationVisitDetail;
  stations: ClinicStation[];
  busy: boolean;
  isOnline: boolean;
  onComplete: (body: {
    handoffNote?: string;
    nextStationId?: string;
    skips?: Array<{ stationId: string; reason: string }>;
  }) => void;
  onRelease: (reason: string) => void;
  onPatientLeft: (reason: string) => void;
}) {
  const isReview = visit.station.kind === 'REVIEW';
  const active = useMemo(() => stations.filter((station) => station.active), [stations]);
  const suggested = suggestedNextStation(active, visit.station.id);
  const [nextId, setNextId] = useState<string>(suggested?.id ?? '');
  const [note, setNote] = useState('');
  const [skipReasons, setSkipReasons] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!nextId && suggested) setNextId(suggested.id);
  }, [nextId, suggested]);

  const passedOver = nextId ? stationsPassedOver(active, visit.station.id, nextId) : [];
  const missingReason = passedOver.some((station) => !skipReasons[station.id]?.trim());
  const nextName = active.find((station) => station.id === nextId)?.name;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {isReview ? 'Complete the session' : 'Hand the patient on'}
        </CardTitle>
        <CardDescription>
          {isReview
            ? 'Completing sends the encounter to a doctor for review. Record counselling first.'
            : 'The next station sees your note before they take the patient.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isReview ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="handoffNote">Note for the next station</Label>
              <Textarea
                id="handoffNote"
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything they should know, e.g. a reading to recheck."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextStation">Next station</Label>
              <Select value={nextId} onValueChange={setNextId}>
                <SelectTrigger id="nextStation" className="sm:w-80">
                  <SelectValue placeholder="Choose a station" />
                </SelectTrigger>
                <SelectContent>
                  {active
                    .filter((station) => station.id !== visit.station.id)
                    .map((station) => (
                      <SelectItem key={station.id} value={station.id}>
                        {station.name}
                        {station.id === suggested?.id ? ' (next in line)' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {passedOver.length ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Skipping, with a reason for each</p>
                {passedOver.map((station) => (
                  <div key={station.id} className="space-y-1">
                    <Label htmlFor={`skip-${station.id}`}>{station.name}</Label>
                    <Input
                      id={`skip-${station.id}`}
                      maxLength={500}
                      value={skipReasons[station.id] ?? ''}
                      placeholder="e.g. out of glucose strips"
                      onChange={(event) =>
                        setSkipReasons({ ...skipReasons, [station.id]: event.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <ReasonButton
            label="Patient left"
            prompt="Why did the patient leave?"
            disabled={!isOnline || busy}
            onSubmit={onPatientLeft}
          />
          <ReasonButton
            label="Put back in queue"
            prompt="Why are you handing this patient back?"
            disabled={!isOnline || busy}
            onSubmit={onRelease}
          />
          <Button
            type="button"
            disabled={!isOnline || busy || (!isReview && (!nextId || missingReason))}
            onClick={() =>
              onComplete(
                isReview
                  ? {}
                  : {
                      handoffNote: note.trim() || undefined,
                      nextStationId: nextId && nextId !== suggested?.id ? nextId : undefined,
                      skips: passedOver.map((station) => ({
                        stationId: station.id,
                        reason: skipReasons[station.id]!.trim(),
                      })),
                    },
              )
            }
          >
            {busy
              ? 'Working…'
              : isReview
                ? 'Complete session'
                : `Send to ${nextName ?? 'next station'}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** A button that asks for a short reason inline before it acts. */
function ReasonButton({
  label,
  prompt,
  disabled,
  onSubmit,
}: {
  label: string;
  prompt: string;
  disabled: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center">
      <Input
        aria-label={prompt}
        placeholder={prompt}
        value={reason}
        maxLength={500}
        autoFocus
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        type="button"
        size="sm"
        disabled={disabled || !reason.trim()}
        onClick={() => onSubmit(reason.trim())}
      >
        {label}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

function ReasonAction({
  title,
  description,
  label,
  disabled,
  onSubmit,
}: {
  title: string;
  description: string;
  label: string;
  disabled: boolean;
  onSubmit: (reason: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ReasonButton label={label} prompt="Reason" disabled={disabled} onSubmit={onSubmit} />
      </CardContent>
    </Card>
  );
}
