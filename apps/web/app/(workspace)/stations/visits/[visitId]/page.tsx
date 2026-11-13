'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, History } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { apiFetch, type GetToken } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { db, type DiabetesScreeningRecord, type VitalsRecord } from '@/lib/db';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { OPS_DEFAULT_TIMEZONE, formatOpsDateTime, getTodayInTimeZone } from '@/lib/ops';
import { isFullySynced } from '@/lib/sync';
import {
  cancelCheckIn,
  claimStationVisit,
  canCorrectPerformer,
  completeStationVisit,
  fetchStationBoard,
  fetchStationVisit,
  fetchStations,
  patientName,
  describePerformerCorrection,
  performerLabel,
  type PerformerCorrection as PerformerCorrectionRecord,
  releaseStationVisit,
  screenerFromName,
  stationsPassedOver,
  suggestedNextStation,
  type ClinicStation,
  type OnShiftStaff,
  type StationVisit,
  type StationVisitDetail,
} from '@/lib/stations';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { InlineNotice } from '@/components/ops/OpsShared';
import { VitalsForm } from '@/components/VitalsForm';
import { MedicalHistoryPanel } from '@/components/patients/MedicalHistoryPanel';
import { ClinicalNotePanel } from '@/components/clinical-notes/ClinicalNotePanel';
import { GlucoseReadingForm } from '@/components/stations/GlucoseReadingForm';
import { CounsellingForm } from '@/components/stations/CounsellingForm';
import { EyeScreeningForm } from '@/components/stations/EyeScreeningForm';
import { eyeScreeningPath, type EyeScreeningRecord } from '@/lib/eye-screening';
import { StationResultsSummary } from '@/components/stations/StationResultsSummary';
import { IntakeInterviews } from '@/components/stations/IntakeInterviews';
import { PerformerCorrection } from '@/components/stations/PerformerCorrection';
import { ScreenerControl } from '@/components/stations/ScreenerControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RecordSection as Card,
  RecordSectionContent as CardContent,
  RecordSectionDescription as CardDescription,
  RecordSectionHeader as CardHeader,
  RecordSectionTitle as CardTitle,
} from '@/components/patients/RecordSection';
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
  /** The intake interview's record, for the hypertension interview to build on. */
  hypertension: Record<string, unknown> | null;
  /** Online only: null offline, and before the eye station records. */
  eye: EyeScreeningRecord | null;
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
  const [readings, setReadings] = useState<EncounterReadings>({
    vitals: null,
    diabetes: null,
    hypertension: null,
    eye: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Edits typed into this station's form since its last save; hand-off asks before dropping them.
  const [unsavedForm, setUnsavedForm] = useState(false);
  // Intake's medical history saves per item and never reports it, so only the interviews count.
  const markUnsaved = (target: EventTarget) => {
    if (visit?.station.kind === 'INTAKE' && !(target as Element).closest?.('[data-interview-flow]'))
      return;
    setUnsavedForm(true);
  };
  /** The caller's own shift, for who is really screening on this account (#227). */
  const [myShift, setMyShift] = useState<OnShiftStaff | null>(null);
  const [changingScreener, setChangingScreener] = useState(false);

  /** The eye record has its own route; a failure leaves the summary showing it as not recorded. */
  const loadEyeScreening = useCallback(
    async (encounterId: string) => {
      if (!getToken || !clinicId) return null;
      try {
        const response = await apiFetch(eyeScreeningPath(clinicId, encounterId), {
          getToken,
          activeClinicId: clinicId,
        });
        if (!response.ok) return null;
        return ((await response.json()) as { record: EyeScreeningRecord | null }).record;
      } catch {
        return null;
      }
    },
    [getToken, clinicId],
  );

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
          hypertensionAssessment?: Record<string, unknown> | null;
        };
        setReadings({
          vitals: encounter.vitals ?? null,
          diabetes: encounter.diabetesScreening ?? null,
          hypertension: encounter.hypertensionAssessment ?? null,
          eye: await loadEyeScreening(encounterId),
        });
      } catch {
        // Offline or unreachable: this device's copy is what the forms build on.
        const [vitals, diabetes, hypertension] = await Promise.all([
          db.vitals.where('encounterId').equals(encounterId).first(),
          db.diabetes_screenings.where('encounterId').equals(encounterId).first(),
          db.hypertension_assessments.where('encounterId').equals(encounterId).first(),
        ]);
        setReadings({
          vitals: vitals ?? null,
          diabetes: diabetes ?? null,
          hypertension: (hypertension as unknown as Record<string, unknown>) ?? null,
          eye: null,
        });
      }
    },
    [getToken, clinicId, loadEyeScreening],
  );

  const load = useCallback(async () => {
    if (!getToken || !clinicId || !enabled) return;
    try {
      const [detail, stationList, board] = await Promise.all([
        fetchStationVisit(clinicId, visitId, getToken),
        fetchStations(clinicId, getToken),
        // The banner only; the visit opens without it.
        fetchStationBoard(clinicId, getTodayInTimeZone(), getToken).catch(() => null),
      ]);
      setVisit(detail);
      setStations(stationList.items);
      if (board) setMyShift(board.onShift?.find((shift) => shift.user.id === userId) ?? null);
      setLoadError(null);
      if (detail.encounterId) await loadReadings(detail.encounterId);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [getToken, clinicId, visitId, enabled, loadReadings, userId]);

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
        {/* The page keeps its heading with the flag off (#313). */}
        <div className="space-y-6">
          <AppPageHeader title="Station visit" />
          <InlineNotice tone="info" live={false}>
            Stations are not turned on for this clinic.
          </InlineNotice>
        </div>
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
              context={visit.station.name}
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

            <section aria-labelledby="visit-needs" className="border-t-2 border-rule-strong pt-4">
              {/* Not "Needs you now": elsewhere that heading lists work to act on, here it explains. */}
              <h2 id="visit-needs" className="type-section-title">
                At this station
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {mine
                  ? `Record ${visit.station.name.toLowerCase()} findings, then hand the patient on. Readings pending sync must reach the server before hand-off.`
                  : visit.status === 'QUEUED'
                    ? 'Take this patient before recording findings.'
                    : visit.status === 'IN_PROGRESS'
                      ? 'This patient is with another member of staff.'
                      : 'This station stop is complete. Earlier findings remain available below.'}
              </p>
            </section>

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

            {mine && myShift?.shiftId ? (
              <InlineNotice tone="info" live={false}>
                <span>
                  Recording as <strong>{myShift.screenerName ?? myShift.user.displayName}</strong>
                  {myShift.screenerName ? ` on ${myShift.user.displayName}'s account` : ''} ·{' '}
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-2 text-info-ink"
                  aria-label="Change who is screening"
                  aria-expanded={changingScreener}
                  onClick={() => setChangingScreener((open) => !open)}
                >
                  Change
                </Button>
                {changingScreener ? (
                  <div className="mt-3">
                    <ScreenerControl
                      clinicId={clinicId}
                      shiftId={myShift.shiftId}
                      screenerName={myShift.screenerName ?? null}
                      isOnline={isOnline}
                      getToken={getToken!}
                      onSaved={(screenerName) => setMyShift({ ...myShift, screenerName })}
                    />
                  </div>
                ) : null}
              </InlineNotice>
            ) : null}

            <Timeline
              timeline={visit.timeline}
              currentId={visit.id}
              timezone={timezone}
              correction={
                getToken
                  ? {
                      clinicId,
                      viewer: { userId, canManage },
                      isOnline,
                      getToken,
                      onCorrected: () => void load(),
                    }
                  : undefined
              }
            />

            {mine && visit.encounterId ? (
              /*
                shortcut: edits are seen as native input/change events and checkbox or radio
                clicks, so a dropdown pick (rendered in a portal) is missed, and only stations
                whose form reports onSaved are guarded (not intake history or the review note).
                At intake only the interviews count; with both open, saving one clears the flag.
                Give each form a dirty flag if those need guarding too.
              */
              <div
                onInput={(event) => markUnsaved(event.target)}
                onChange={(event) => markUnsaved(event.target)}
                onClick={(event) => {
                  if (
                    (event.target as Element).closest(
                      '[role="checkbox"],[role="radio"],[role="switch"]',
                    )
                  )
                    markUnsaved(event.target);
                }}
              >
                <StationForm
                  visit={visit}
                  clinicId={clinicId}
                  userId={userId}
                  isDoctor={isDoctor}
                  readings={readings}
                  timezone={timezone}
                  onSaved={() => {
                    setUnsavedForm(false);
                    void loadReadings(visit.encounterId!);
                  }}
                />
              </div>
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
                onComplete={async (body) => {
                  if (
                    unsavedForm &&
                    GUARDED_STATION_KINDS.has(visit.station.kind) &&
                    !(await confirmAction({
                      title: `${visit.station.name} is not saved`,
                      description:
                        'This station has answers that were typed but not saved. Handing the patient on now leaves them out of the record.',
                      confirmLabel: 'Hand on without saving',
                      cancelLabel: 'Go back and save',
                      destructive: true,
                    }))
                  )
                    return;
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
                      return completeStationVisit(
                        clinicId,
                        visit.id,
                        // Sent, not inferred, so the stamp is what the banner showed (#227).
                        myShift
                          ? { ...body, screener: screenerFromName(myShift.screenerName) }
                          : body,
                        getToken!,
                      );
                    },
                    () => router.push('/stations'),
                  );
                }}
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
  correction,
}: {
  timeline: StationVisit[];
  currentId: string;
  timezone: string;
  /** Who may fix who did each stop (#227); absent until signed in. */
  correction?: {
    clinicId: string;
    viewer: { userId: string; canManage: boolean };
    isOnline: boolean;
    getToken: GetToken;
    onCorrected: () => void;
  };
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
            <li key={stop.id} className="border-b border-rule py-3 text-sm">
              <p className="font-medium">
                {stop.station.name} · {STATUS_LABELS[stop.status]}
                {stop.completedBy
                  ? ` · ${performerLabel(stop.completedBy.displayName, stop.performedByName)}`
                  : ''}
                {stop.completedAt ? ` · ${formatOpsDateTime(stop.completedAt, timezone)}` : ''}
              </p>
              {stop.performerCorrection ? (
                <PerformerCorrectionNote
                  correction={stop.performerCorrection}
                  timezone={timezone}
                />
              ) : null}
              {stop.handoffNote ? <p className="mt-1">{stop.handoffNote}</p> : null}
              {stop.endReason && stop.status !== 'COMPLETED' ? (
                <p className="mt-1 text-muted-foreground">Reason: {stop.endReason}</p>
              ) : null}
              {correction && canCorrectPerformer(stop, correction.viewer) ? (
                <PerformerCorrection
                  clinicId={correction.clinicId}
                  stop={stop}
                  isOnline={correction.isOnline}
                  getToken={correction.getToken}
                  onCorrected={correction.onCorrected}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Stations whose form calls onSaved, so a cleared flag means the readings were saved. */
const GUARDED_STATION_KINDS = new Set([
  'INTAKE',
  'BLOOD_PRESSURE',
  'ANTHROPOMETRY',
  'GLUCOSE',
  'EYE',
]);

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
        <div className="space-y-6">
          <MedicalHistoryPanel
            ruled
            clinicId={clinicId}
            patientId={visit.patient.id}
            userId={userId}
            canWrite
          />
          {isWebFeatureEnabled('guidedChronicTabs') ? (
            <IntakeInterviews
              clinicId={clinicId}
              encounterId={encounterId}
              patientId={visit.patient.id}
              vitals={readings.vitals}
              hypertension={readings.hypertension}
              diabetes={readings.diabetes}
              onSaved={onSaved}
            />
          ) : null}
        </div>
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
    case 'EYE':
      return (
        <EyeScreeningForm
          ruled
          clinicId={clinicId}
          encounterId={encounterId}
          canEdit
          onSaved={onSaved}
        />
      );
    case 'REVIEW':
      return (
        <div className="space-y-6">
          <StationResultsSummary
            ruled
            timeline={visit.timeline}
            vitals={readings.vitals}
            diabetes={readings.diabetes}
            eye={readings.eye}
            timezone={timezone}
          />
          <CounsellingForm ruled clinicId={clinicId} encounterId={encounterId} canEdit />
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
              <div className="space-y-2 border-b border-rule py-3">
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
    <div className="flex flex-col gap-2 border-b border-rule py-3 sm:flex-row sm:items-center">
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

/** The earlier performer, struck through, with who corrected it and when (#307). */
function PerformerCorrectionNote({
  correction,
  timezone,
}: {
  correction: PerformerCorrectionRecord;
  timezone: string;
}) {
  const { previous, summary, reason } = describePerformerCorrection(correction, (iso) =>
    formatOpsDateTime(iso, timezone),
  );
  return (
    <p className="mt-1 text-muted-foreground">
      {previous ? (
        <>
          <span className="sr-only">Previously recorded as </span>
          <del className="line-through">{previous}</del>{' '}
        </>
      ) : null}
      {summary}.{reason ? ` ${reason}` : null}
    </p>
  );
}
