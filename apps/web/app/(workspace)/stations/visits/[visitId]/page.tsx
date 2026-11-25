'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, History, MessageSquareWarning } from 'lucide-react';
import { openReportProblem } from '@/components/report-problem/ReportProblemDialog';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap, useClinicUnits } from '@/lib/bootstrap-context';
import { lineFlagsFor, type LineFlagSource } from '@nkwapa/db/station-line-flags';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { ApiError, apiFetch, type GetToken } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { db, type DiabetesScreeningRecord, type VitalsRecord } from '@/lib/db';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import {
  dayNumberLabel,
  displayTimeZone,
  formatOpsDateTime,
  getTodayInTimeZone,
  formatOpsDay,
} from '@/lib/ops';
import { isFullySynced } from '@/lib/sync';
import { opsCacheKey, readOpsCache, writeOpsCache } from '@/lib/ops-cache';
import { buildStationHandOffMutation } from '@/lib/ops-offline';
import { enqueueOutboxMutation } from '@/lib/outbox';
import { queuedEyeScreening } from '@/lib/eye-screening-offline';
import {
  PRACTICE_CLEARED_REASON,
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
  StationRequestError,
  stationsPassedOver,
  suggestedNextStation,
  type ClinicStation,
  type OnShiftStaff,
  type StationVisit,
  type StationVisitDetail,
  usePolling,
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
import {
  StationResultsSummary,
  newlyRecorded,
  nothingRecordedAt,
  type SummaryRowKind,
} from '@/components/stations/StationResultsSummary';
import { IntakeInterviews } from '@/components/stations/IntakeInterviews';
import {
  LineFlagChip,
  LineFlagsNotice,
  suggestedHandoffNote,
} from '@/components/stations/LineFlags';
import { PerformerCorrection } from '@/components/stations/PerformerCorrection';
import { AskDoctorButton } from '@/components/stations/AskDoctorDialog';
import { DoctorRequestChip } from '@/components/stations/DoctorRequestChip';
import { ScreenerControl } from '@/components/stations/ScreenerControl';
import { Badge } from '@/components/ui/badge';
import { DemoBadge } from '@/components/patients/DemoPatientField';
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
  /** The server's, or this device's queued save (#423); null before the eye station records. */
  eye: EyeScreeningRecord | null;
}

/** The flag a station's own reading can raise, for its hand-off note (#415). */
const FLAG_SOURCE_AT: Partial<Record<StationVisit['station']['kind'], LineFlagSource>> = {
  BLOOD_PRESSURE: 'BP',
  GLUCOSE: 'GLUCOSE',
};

/** What a held visit needs to reopen offline (#423). */
interface VisitCopy {
  visit: StationVisitDetail;
  stations: ClinicStation[];
}

function isVisitCopy(data: unknown): data is VisitCopy {
  const copy = data as Partial<VisitCopy> | null;
  return Boolean(copy?.visit?.id && copy.visit.station && Array.isArray(copy.stations));
}

/** A request that never got an answer, as opposed to one the server refused. */
function isUnanswered(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT')
  );
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
  const { glucoseUnit } = useClinicUnits();

  const [visit, setVisit] = useState<StationVisitDetail | null>(null);
  const [stations, setStations] = useState<ClinicStation[]>([]);
  const [readings, setReadings] = useState<EncounterReadings>({
    vitals: null,
    diabetes: null,
    hypertension: null,
    eye: null,
  });
  // What the summary shows now, for the poll to compare against without re-creating itself.
  const readingsRef = useRef(readings);
  // Set by Register and start: the new patient's number goes on their card first (#413).
  const [registered, setRegistered] = useState(false);
  useEffect(() => {
    setRegistered(new URLSearchParams(window.location.search).has('registered'));
  }, []);
  useEffect(() => {
    readingsRef.current = readings;
  }, [readings]);
  /** Readings that reached the review screen after it opened, and when (#427). */
  const [addedAt, setAddedAt] = useState<Partial<Record<SummaryRowKind, string>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The visit on screen is this device's copy, opened without a connection (#423). */
  const [savedCopy, setSavedCopy] = useState(false);
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

  /** The eye record has its own route; undefined when it could not be read. */
  const loadEyeScreening = useCallback(
    async (encounterId: string) => {
      if (!getToken || !clinicId) return undefined;
      try {
        const response = await apiFetch(eyeScreeningPath(clinicId, encounterId), {
          getToken,
          activeClinicId: clinicId,
        });
        if (!response.ok) return undefined;
        return ((await response.json()) as { record: EyeScreeningRecord | null }).record;
      } catch {
        return undefined;
      }
    },
    [getToken, clinicId],
  );

  /** The server's readings for the encounter; throws when the server cannot be reached. */
  const fetchServerReadings = useCallback(
    async (encounterId: string, previousEye: EyeScreeningRecord | null) => {
      const response = await apiFetch(`/encounters/${encodeURIComponent(encounterId)}`, {
        getToken: getToken!,
        activeClinicId: clinicId ?? undefined,
      });
      if (!response.ok) throw new Error(String(response.status));
      const encounter = (await response.json()) as {
        vitals?: VitalsRecord | null;
        diabetesScreening?: DiabetesScreeningRecord | null;
        hypertensionAssessment?: Record<string, unknown> | null;
      };
      const eye = await loadEyeScreening(encounterId);
      return {
        vitals: encounter.vitals ?? null,
        diabetes: encounter.diabetesScreening ?? null,
        hypertension: encounter.hypertensionAssessment ?? null,
        // An eye read that failed keeps what was there, so the row never blanks.
        eye: eye === undefined ? previousEye : eye,
      } satisfies EncounterReadings;
    },
    [getToken, clinicId, loadEyeScreening],
  );

  const loadReadings = useCallback(
    async (encounterId: string) => {
      if (!getToken) return;
      // An eye examination saved on this device and not sent yet still counts (#423).
      const queuedEye = () =>
        clinicId ? queuedEyeScreening(db, clinicId, encounterId) : Promise.resolve(null);
      try {
        const server = await fetchServerReadings(encounterId, null);
        setReadings(server.eye ? server : { ...server, eye: await queuedEye() });
      } catch {
        // Offline or unreachable: this device's copy is what the forms build on.
        const [vitals, diabetes, hypertension, eye] = await Promise.all([
          db.vitals.where('encounterId').equals(encounterId).first(),
          db.diabetes_screenings.where('encounterId').equals(encounterId).first(),
          db.hypertension_assessments.where('encounterId').equals(encounterId).first(),
          queuedEye(),
        ]);
        setReadings({
          vitals: vitals ?? null,
          diabetes: diabetes ?? null,
          hypertension: (hypertension as unknown as Record<string, unknown>) ?? null,
          eye,
        });
      }
    },
    [getToken, fetchServerReadings, clinicId],
  );

  const load = useCallback(async () => {
    if (!getToken || !clinicId || !enabled) return;
    const copyKey = { clinicId, kind: 'station-visit' as const, date: getTodayInTimeZone() };
    try {
      const [detail, stationList, board] = await Promise.all([
        fetchStationVisit(clinicId, visitId, getToken),
        fetchStations(clinicId, getToken),
        // The banner only; the visit opens without it.
        fetchStationBoard(clinicId, getTodayInTimeZone(), getToken).catch(() => null),
      ]);
      setVisit(detail);
      setStations(stationList.items);
      setSavedCopy(false);
      if (board) setMyShift(board.onShift?.find((shift) => shift.user.id === userId) ?? null);
      setLoadError(null);
      // shortcut: one held visit per clinic on a device; keep several if volunteers hold more.
      if (detail.status === 'IN_PROGRESS' && detail.claimedBy?.id === userId) {
        void writeOpsCache(db, {
          ...copyKey,
          data: { visit: detail, stations: stationList.items },
        });
      }
      if (detail.encounterId) await loadReadings(detail.encounterId);
    } catch (error) {
      // Offline, a visit this device holds opens from its copy (#423).
      const copy = await readOpsCache<VisitCopy>(db, { ...copyKey, isValid: isVisitCopy });
      if (copy?.data.visit.id === visitId) {
        setVisit(copy.data.visit);
        setStations(copy.data.stations);
        setSavedCopy(true);
        setLoadError(null);
        if (copy.data.visit.encounterId) await loadReadings(copy.data.visit.encounterId);
        return;
      }
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [getToken, clinicId, visitId, enabled, loadReadings, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = visit?.status === 'IN_PROGRESS' && visit.claimedBy?.id === userId;
  /** The visit is no longer this device's to reopen offline. */
  const forgetVisitCopy = () => {
    if (clinicId) void db.ops_cache.delete(opsCacheKey(clinicId, 'station-visit')).catch(() => {});
  };

  // The review summary keeps up with readings that reach the server after it opened (#427):
  // a glucose entered late from paper, or held in another device's outbox. Only the visit and
  // its readings refresh; the counselling form and note keep their own state.
  const reviewEncounterId =
    mine && visit?.station.kind === 'REVIEW' ? (visit.encounterId ?? null) : null;
  const refreshReview = useCallback(async () => {
    if (!reviewEncounterId || !getToken || !clinicId) return;
    try {
      const [detail, next] = await Promise.all([
        fetchStationVisit(clinicId, visitId, getToken),
        fetchServerReadings(reviewEncounterId, readingsRef.current.eye),
      ]);
      const arrived = newlyRecorded(readingsRef.current, next);
      if (arrived.length) {
        const now = new Date().toISOString();
        setAddedAt((current) => ({
          ...current,
          ...Object.fromEntries(arrived.map((row) => [row, now])),
        }));
      }
      setVisit(detail);
      setReadings(next);
    } catch {
      // A missed poll keeps what is on screen; the next one tries again.
    }
  }, [reviewEncounterId, getToken, clinicId, visitId, fetchServerReadings]);
  usePolling(refreshReview, isOnline && reviewEncounterId !== null);

  // A demo patient held here can be cleared by the director mid-visit (#410). Watching the visit
  // closes the forms and says so on the next poll, before a save fails against a deleted draft.
  const watchPractice = mine && visit?.patient.isDemo === true;
  const refreshPractice = useCallback(async () => {
    if (!getToken || !clinicId) return;
    try {
      const detail = await fetchStationVisit(clinicId, visitId, getToken);
      if (detail.status !== 'IN_PROGRESS') setVisit(detail);
    } catch {
      // The next poll tries again.
    }
  }, [getToken, clinicId, visitId]);
  usePolling(refreshPractice, isOnline && watchPractice);
  const practiceCleared =
    visit?.status === 'CANCELLED' && visit.endReason === PRACTICE_CLEARED_REASON;
  useEffect(() => {
    if (!practiceCleared || !clinicId) return;
    void db.ops_cache.delete(opsCacheKey(clinicId, 'station-visit')).catch(() => {});
  }, [practiceCleared, clinicId]);

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

  const timezone = displayTimeZone();

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
              description={`${visit.patient.patientCode}${visit.patient.dob ? ` · born ${formatOpsDay(`${visit.patient.dob.slice(0, 10)}T12:00:00Z`)}` : ''} · checked in ${formatOpsDateTime(visit.checkedInAt, timezone)}`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {/* Large enough to read out to the patient across a table (#413). */}
                  <span
                    className="mr-1 font-mono text-2xl font-semibold tabular-nums"
                    translate="no"
                  >
                    {dayNumberLabel(visit.dayNumber)}
                  </span>
                  <DemoBadge isDemo={visit.patient.isDemo} />
                  <LineFlagChip flags={visit.lineFlags} />
                  <DoctorRequestChip request={visit.doctorRequest} me={userId} />
                  {visit.station.kind !== 'REVIEW' &&
                  !visit.doctorRequest?.claimedBy &&
                  ['QUEUED', 'IN_PROGRESS'].includes(visit.status) ? (
                    <AskDoctorButton
                      clinicId={clinicId}
                      visitId={visit.id}
                      isOnline={isOnline}
                      getToken={getToken!}
                      onSent={(doctorRequest) =>
                        setVisit((current) => (current ? { ...current, doctorRequest } : current))
                      }
                    />
                  ) : null}
                  <Badge variant={mine ? 'default' : 'secondary'}>
                    {STATUS_LABELS[visit.status]}
                    {visit.claimedBy && visit.status === 'IN_PROGRESS'
                      ? ` · ${mine ? 'with you' : visit.claimedBy.displayName}`
                      : ''}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() =>
                      openReportProblem({ kind: visit.station.kind, name: visit.station.name })
                    }
                  >
                    <MessageSquareWarning aria-hidden="true" />
                    Report a problem
                  </Button>
                </div>
              }
            />

            <section aria-labelledby="visit-needs" className="border-t-2 border-rule-strong pt-4">
              {/* Not "Needs you now": elsewhere that heading lists work to act on, here it explains. */}
              <h2 id="visit-needs" className="type-section-title">
                At this station
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {practiceCleared
                  ? 'Practice is over.'
                  : mine
                    ? `Record ${visit.station.name.toLowerCase()} findings, then hand the patient on.`
                    : visit.status === 'QUEUED'
                      ? 'Take this patient before recording findings.'
                      : visit.status === 'IN_PROGRESS'
                        ? 'This patient is with another member of staff.'
                        : 'This station stop is complete. Earlier findings remain available below.'}
              </p>
            </section>

            {registered && visit.dayNumber ? (
              <InlineNotice tone="success" live={false}>
                <span className="text-lg">
                  Patient number{' '}
                  <strong className="font-mono tabular-nums" translate="no">
                    {visit.dayNumber}
                  </strong>
                  . Write it on their card.
                </span>
              </InlineNotice>
            ) : null}
            <LineFlagsNotice
              flags={visit.lineFlags}
              timezone={timezone}
              title={
                visit.station.kind === 'REVIEW'
                  ? 'Red flags raised along the line'
                  : 'Red flags from earlier stations'
              }
            />
            {practiceCleared ? (
              <InlineNotice tone="info">
                The director cleared the practice patients, so there is nothing more to record for
                this one.{' '}
                <Link href="/stations" className="font-medium underline underline-offset-4">
                  Back to stations
                </Link>
              </InlineNotice>
            ) : actionError ? (
              <InlineNotice tone="error">{actionError}</InlineNotice>
            ) : null}
            {!isOnline || savedCopy ? (
              <InlineNotice tone="warning" live={false}>
                {savedCopy
                  ? 'The server cannot be reached, so this visit opened from this device. '
                  : 'You are offline. '}
                {visit.station.kind === 'REVIEW'
                  ? 'Readings still save on this device; completing the session waits for a connection.'
                  : 'Readings save on this device, and handing on is sent when the connection returns. Until then the next station cannot see the patient: say their number and send them on.'}
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
                data-station-form
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
                  addedAt={addedAt}
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
                suggestedNote={suggestedHandoffNote(
                  lineFlagsFor({
                    systolic: readings.vitals?.systolicBp,
                    diastolic: readings.vitals?.diastolicBp,
                    glucoseMgDl: readings.diabetes?.glucoseMgDl,
                    glucoseType: readings.diabetes?.glucoseType,
                  }).filter((flag) => flag.source === FLAG_SOURCE_AT[visit.station.kind]),
                  glucoseUnit,
                )}
                nothingRecorded={nothingRecordedAt(visit.station.kind, readings)}
                // Typed but unsaved answers are asked about first: saving them is the usual fix.
                confirmUnsaved={async () =>
                  !unsavedForm ||
                  !GUARDED_STATION_KINDS.has(visit.station.kind) ||
                  confirmAction({
                    title: `${visit.station.name} is not saved`,
                    description:
                      'This station has answers that were typed but not saved. Handing the patient on now leaves them out of the record.',
                    confirmLabel: 'Hand on without saving',
                    cancelLabel: 'Go back and save',
                    destructive: true,
                  })
                }
                onComplete={(body) => {
                  let handedTo = '';
                  let stayed = false;
                  let queued = false;
                  let doctorNotified = false;
                  // Sent, not inferred, so the stamp is what the banner showed (#227).
                  const sent = myShift
                    ? { ...body, screener: screenerFromName(myShift.screenerName) }
                    : body;
                  // Offline (#423): queued behind this station's readings, so the server applies
                  // them first, and sent when the connection returns.
                  const queueHandOff = async () => {
                    await enqueueOutboxMutation(
                      db,
                      buildStationHandOffMutation({
                        clinicId,
                        occurredAt: new Date().toISOString(),
                        actorUserId: userId,
                        actorName: bootstrap?.displayName ?? undefined,
                        visitId: visit.id,
                        body: sent,
                        patient: {
                          patientCode: visit.patient.patientCode,
                          displayName: patientName(visit.patient),
                        },
                      }),
                    );
                    const nextId =
                      body.nextStationId ??
                      suggestedNextStation(
                        stations.filter((station) => station.active),
                        visit.station.id,
                      )?.id;
                    handedTo = stations.find((station) => station.id === nextId)?.name ?? '';
                    queued = true;
                  };
                  void run(
                    async () => {
                      const isReview = visit.station.kind === 'REVIEW';
                      if (!isOnline && !isReview) return queueHandOff();
                      // The next station reads what this one recorded, so it must reach the
                      // server first. A reading still queued would arrive after the hand-off.
                      const synced = await syncNow(clinicId);
                      // No server to reach (a phone that still says online): the hand-off waits
                      // behind the readings instead. A refused reading still stops it.
                      if (synced && !synced.success && !synced.blockedCount && !isReview) {
                        return queueHandOff();
                      }
                      if (!isFullySynced(synced)) {
                        throw new Error(
                          'Some readings have not reached the server yet. Check the sync status, then hand the patient on.',
                        );
                      }
                      let result;
                      try {
                        result = await completeStationVisit(clinicId, visit.id, sent, getToken!);
                      } catch (error) {
                        // No answer: the same hand-off is queued, and the server applies it once.
                        if (isUnanswered(error) && !isReview) {
                          await queueHandOff();
                          return;
                        }
                        // Review warns about a refer-today patient with no referral (#415).
                        if (
                          !(error instanceof StationRequestError) ||
                          error.code !== 'REFERRAL_NOT_RECORDED'
                        )
                          throw error;
                        const anyway = await confirmAction({
                          title: 'No referral recorded',
                          description:
                            'No referral recorded for a refer-today reading. Complete anyway?',
                          confirmLabel: 'Complete anyway',
                          cancelLabel: 'Go back and record it',
                          destructive: true,
                        });
                        if (!anyway) {
                          stayed = true;
                          return;
                        }
                        result = await completeStationVisit(
                          clinicId,
                          visit.id,
                          { ...sent, acknowledgeNoReferral: true },
                          getToken!,
                        );
                      }
                      doctorNotified = Boolean(result.doctorRequested);
                      handedTo = result.sessionCompleted
                        ? 'done'
                        : (stations.find((station) => station.id === result.nextStationId)?.name ??
                          '');
                    },
                    // The queue says where the patient went, with the next patient one tap away.
                    // Only the station name and the day number ride in the URL; never the patient's.
                    () => {
                      if (stayed) return void load();
                      forgetVisitCopy();
                      router.push(
                        `/stations?sent=${encodeURIComponent(handedTo)}${visit.dayNumber ? `&no=${visit.dayNumber}` : ''}${queued ? '&queued=1' : ''}${doctorNotified ? '&doctor=1' : ''}`,
                      );
                    },
                  );
                }}
                onRelease={(reason) =>
                  void run(
                    () => releaseStationVisit(clinicId, visit.id, reason, getToken!),
                    () => {
                      forgetVisitCopy();
                      router.push('/stations');
                    },
                  )
                }
                onPatientLeft={(reason) =>
                  void run(
                    () => cancelCheckIn(clinicId, visit.checkInId, reason, getToken!),
                    () => {
                      forgetVisitCopy();
                      router.push('/stations');
                    },
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
  addedAt,
  onSaved,
}: {
  visit: StationVisitDetail;
  clinicId: string;
  userId: string;
  isDoctor: boolean;
  readings: EncounterReadings;
  timezone: string;
  addedAt: Partial<Record<SummaryRowKind, string>>;
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
            addedAt={addedAt}
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
  nothingRecorded,
  confirmUnsaved,
  suggestedNote,
  onComplete,
  onRelease,
  onPatientLeft,
}: {
  visit: StationVisitDetail;
  stations: ClinicStation[];
  busy: boolean;
  isOnline: boolean;
  /** This station's own reading is missing, so handing on asks first (#424). */
  nothingRecorded: boolean;
  /** Resolves false when the volunteer goes back to save typed answers. */
  confirmUnsaved: () => Promise<boolean>;
  /** A flag this station's reading raised, as a note line the volunteer can edit (#415). */
  suggestedNote: string;
  onComplete: (body: {
    handoffNote?: string;
    nextStationId?: string;
    skips?: Array<{ stationId: string; reason: string }>;
    skipReason?: string;
  }) => void;
  onRelease: (reason: string) => void;
  onPatientLeft: (reason: string) => void;
}) {
  const isReview = visit.station.kind === 'REVIEW';
  const active = useMemo(() => stations.filter((station) => station.active), [stations]);
  const suggested = suggestedNextStation(active, visit.station.id);
  const [nextId, setNextId] = useState<string>(suggested?.id ?? '');
  const [note, setNote] = useState('');
  const [noteEdited, setNoteEdited] = useState(false);
  // Follows the reading until the volunteer types their own note.
  useEffect(() => {
    if (!noteEdited) setNote(suggestedNote);
  }, [suggestedNote, noteEdited]);
  const [skipReasons, setSkipReasons] = useState<Record<string, string>>({});
  // Asked on Send when nothing was recorded here; a reading saved meanwhile ends the question.
  const [askingWhy, setAskingWhy] = useState(false);
  const [nothingReason, setNothingReason] = useState('');
  const asking = askingWhy && nothingRecorded;
  useEffect(() => {
    if (!nextId && suggested) setNextId(suggested.id);
  }, [nextId, suggested]);

  const passedOver = nextId ? stationsPassedOver(active, visit.station.id, nextId) : [];
  const missingReason = passedOver.some((station) => !skipReasons[station.id]?.trim());
  const nextName = active.find((station) => station.id === nextId)?.name;
  const body = () =>
    isReview
      ? {}
      : {
          handoffNote: note.trim() || undefined,
          nextStationId: nextId && nextId !== suggested?.id ? nextId : undefined,
          skips: passedOver.map((station) => ({
            stationId: station.id,
            reason: skipReasons[station.id]!.trim(),
          })),
        };
  const goBack = () => {
    setAskingWhy(false);
    // Back to the station's own form, where the reading goes.
    const field = document.querySelector<HTMLElement>(
      '[data-station-form] input:not([disabled]), [data-station-form] button:not([disabled])',
    );
    field?.scrollIntoView({ block: 'center' });
    field?.focus({ preventScroll: true });
  };

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
                onChange={(event) => {
                  setNoteEdited(true);
                  setNote(event.target.value);
                }}
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

        {asking ? (
          <div
            role="group"
            aria-labelledby="nothing-recorded-title"
            className="space-y-3 rounded-md border border-warning/25 bg-warning/10 p-4"
          >
            <p
              id="nothing-recorded-title"
              className="flex items-start gap-2 font-semibold text-warning-ink"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Nothing was recorded at {visit.station.name}. Hand on anyway?
            </p>
            <p className="text-sm text-warning-ink">
              Skipping keeps this stop in the record as skipped, with your reason, so review knows
              why there is no reading.
            </p>
            <div className="space-y-1">
              <Label htmlFor="nothingRecordedReason">Why was nothing recorded?</Label>
              <Input
                id="nothingRecordedReason"
                autoFocus
                maxLength={500}
                value={nothingReason}
                placeholder="e.g. patient declined, machine not working"
                onChange={(event) => setNothingReason(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={goBack}>
                Go back
              </Button>
              <Button
                type="button"
                disabled={busy || !nothingReason.trim()}
                onClick={() => onComplete({ ...body(), skipReason: nothingReason.trim() })}
              >
                {busy ? 'Working…' : 'Skip this station'}
              </Button>
            </div>
          </div>
        ) : (
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
              disabled={busy || (isReview ? !isOnline : !nextId || missingReason)}
              onClick={async () => {
                if (!(await confirmUnsaved())) return;
                if (nothingRecorded) setAskingWhy(true);
                else onComplete(body());
              }}
            >
              {busy
                ? 'Working…'
                : isReview
                  ? 'Complete session'
                  : `Send to ${nextName ?? 'next station'}`}
            </Button>
          </div>
        )}
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
