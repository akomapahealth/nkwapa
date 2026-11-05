'use client';

import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { InlineNotice } from '@/components/ops/OpsShared';
import { StatusLabel } from '@/components/ui/status-label';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoHint } from '@/components/ui/info-hint';
import {
  RecordSection,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  encounterQueueQuery,
  laneTotal,
  type EncounterQueueCounts,
  type EncounterQueueStage,
} from '@/lib/encounter-queues';

interface QueueRow {
  id: string;
  patientCode: string;
  patientName: string;
  createdAt: string;
  bpStage?: string;
  glucoseFlag?: boolean;
  status: string;
}

type Lane = 'drafts' | 'review' | 'finalize' | 'cosign';

// One sentence per lane; the count lives only on the lane's tab.
const LANE_COPY: Record<Lane, string> = {
  drafts: 'Visits still being recorded. They move to review when submitted.',
  review: 'Submitted visits waiting for a clinical review.',
  finalize: 'Reviewed visits waiting for a doctor to sign off. Finalizing locks the record.',
  cosign: 'HAP notes assigned to you and waiting for your cosign.',
};

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes('*') || permissions.includes(perm);
}

export default function QueuesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') ?? '';
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const clinicRoles =
    bootstrap?.memberships.find((membership) => membership.clinicId === clinicId)?.roles ?? [];

  const canFinalize = hasPermission(perms, 'DOCTOR.FINALIZE');
  const canReview = hasPermission(perms, 'ENCOUNTER.REVIEW');
  const canDrafts = hasPermission(perms, 'ENCOUNTER.READ');
  const canCosignClinicalNotes =
    isWebFeatureEnabled('clinicalNotes') &&
    clinicRoles.includes('DOCTOR') &&
    hasPermission(perms, 'CLINICAL_NOTE.COSIGN');

  const defaultTab = canCosignClinicalNotes
    ? 'cosign'
    : canFinalize
      ? 'finalize'
      : canReview
        ? 'review'
        : 'drafts';
  const [activeTab, setActiveTab] = useState(
    tabParam && ['drafts', 'review', 'finalize', 'cosign'].includes(tabParam)
      ? tabParam
      : defaultTab,
  );

  const { isOnline } = useSync();
  const [drafts, setDrafts] = useState<QueueRow[]>([]);
  const [review, setReview] = useState<QueueRow[]>([]);
  const [finalize, setFinalize] = useState<QueueRow[]>([]);
  const [cosign, setCosign] = useState<QueueRow[]>([]);
  const [counts, setCounts] = useState<EncounterQueueCounts | null>(null);
  const [loadingMore, setLoadingMore] = useState<Lane | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(
    async (stage: EncounterQueueStage, skip = 0) => {
      if (!clinicId || !getToken) return [];
      const params = encounterQueueQuery(stage, skip);
      const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/encounters?${params}`, {
        getToken,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Array<{
        id: string;
        status: string;
        createdAt: string;
        patient?: {
          patientCode: string;
          firstName: string;
          lastName: string;
        };
        vitals?: { systolicBp?: number; diastolicBp?: number };
        hypertensionAssessment?: { classification?: string };
        diabetesScreening?: { glucoseMgDl?: number; glucoseType?: string };
      }>;
      return data.map((e) => {
        const patient = e.patient;
        const name = patient
          ? `${patient.firstName} ${patient.lastName}`.trim()
          : 'Unknown patient';
        const code = patient?.patientCode ?? 'No code';
        const bp = e.hypertensionAssessment?.classification ?? '';
        const glucose =
          e.diabetesScreening?.glucoseMgDl != null
            ? (e.diabetesScreening.glucoseType === 'FASTING' &&
                e.diabetesScreening.glucoseMgDl >= 126) ||
              (e.diabetesScreening.glucoseType === 'RANDOM' &&
                e.diabetesScreening.glucoseMgDl >= 200)
            : false;
        return {
          id: e.id,
          patientCode: code,
          patientName: name,
          createdAt: e.createdAt,
          bpStage: bp,
          glucoseFlag: glucose,
          status: e.status,
        };
      });
    },
    [clinicId, getToken],
  );

  const loadAll = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const countsRequest = getToken
        ? apiFetch(`/clinics/${encodeURIComponent(clinicId)}/encounters/counts`, { getToken })
            .then(async (res) => (res.ok ? ((await res.json()) as EncounterQueueCounts) : null))
            // The lanes still load without the totals; the tabs then count loaded rows.
            .catch(() => null)
        : Promise.resolve(null);
      const [d, r, f, c] = await Promise.all([
        canDrafts ? fetchQueue('DRAFT') : [],
        canReview ? fetchQueue('REVIEW') : [],
        canFinalize ? fetchQueue('DOCTOR_READY') : [],
        canCosignClinicalNotes && getToken
          ? apiFetch(`/clinics/${encodeURIComponent(clinicId)}/clinical-notes/pending-cosign`, {
              getToken,
              activeClinicId: clinicId,
            }).then(async (response) => {
              if (!response.ok) throw new Error(await response.text());
              const rows = (await response.json()) as Array<{
                id: string;
                encounterId: string;
                submittedAt: string;
                author: { displayName: string };
                patient: { patientCode: string; firstName: string; lastName: string };
              }>;
              return rows.map((note) => ({
                id: note.encounterId,
                patientCode: note.patient.patientCode,
                patientName: `${note.patient.firstName} ${note.patient.lastName}`.trim(),
                createdAt: note.submittedAt,
                status: `HAP note by ${note.author.displayName}`,
              }));
            })
          : [],
      ]);
      setDrafts(d);
      setReview(r);
      setFinalize(f);
      setCosign(c);
      setCounts(await countsRequest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clinicId, canDrafts, canReview, canFinalize, canCosignClinicalNotes, fetchQueue, getToken]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const pagedLanes = {
    drafts: { stage: 'DRAFT', rows: drafts, set: setDrafts },
    review: { stage: 'REVIEW', rows: review, set: setReview },
    finalize: { stage: 'DOCTOR_READY', rows: finalize, set: setFinalize },
  } as const;

  const loadMore = async (lane: keyof typeof pagedLanes) => {
    const { stage, rows, set } = pagedLanes[lane];
    setLoadingMore(lane);
    setError(null);
    try {
      const next = await fetchQueue(stage, rows.length);
      set((current) => [
        ...current,
        ...next.filter((row) => !current.some((c) => c.id === row.id)),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(null);
    }
  };

  const columns: DataTableColumn<QueueRow>[] = [
    {
      id: 'patientName',
      accessorKey: 'patientName',
      header: 'Patient',
      cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span>,
    },
    {
      id: 'patientCode',
      accessorKey: 'patientCode',
      header: 'Code',
      cell: ({ getValue }) => <span className="font-mono text-xs">{String(getValue())}</span>,
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return v ? (
          <span className="tabular-nums">{new Date(v as string).toLocaleString()}</span>
        ) : (
          ''
        );
      },
    },
    {
      id: 'bpStage',
      accessorKey: 'bpStage',
      header: 'BP',
      cell: ({ getValue }) => (getValue() ? <StatusLabel value={String(getValue())} /> : null),
    },
    {
      id: 'glucoseFlag',
      accessorKey: 'glucoseFlag',
      header: 'Glucose',
      cell: ({ getValue }) => (getValue() ? <GlucoseFlag /> : null),
    },
  ];

  const handleRowClick = (row: { id: string }) => {
    router.push(`/encounters/${row.id}`);
  };

  return (
    <RouteGuard requiredPermission="ENCOUNTER.READ" requiresClinic clinicSurface="Encounter queues">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinical workflow"
          title="Queues"
          description="See which visits are moving and which are waiting."
          helpTitle="How the queues work"
          helpText="Each lane groups encounters by the step they are currently in so staff can jump straight to the right record without bouncing between screens."
        />

        {!isOnline ? (
          <InlineNotice tone="warning">
            You are offline. Reconnect to load the queues. Any visits already shown are the last
            version loaded.
          </InlineNotice>
        ) : null}
        {error ? (
          <InlineErrorState
            title="The queues could not be loaded"
            description={error}
            onRetry={() => void loadAll()}
          />
        ) : null}

        <RecordSection aria-labelledby="encounter-queues-title">
          <RecordSectionHeader>
            <RecordSectionTitle id="encounter-queues-title">
              <span className="align-middle">Encounter queues</span>
              <InfoHint
                label="Drafts are still being prepared, Needs review is waiting on clinical review, and Ready to finalize is waiting on doctor sign-off."
                className="ml-2"
              />
            </RecordSectionTitle>
            <RecordSectionDescription>
              Each lane shows how many visits it holds. Open a visit to work on it.
            </RecordSectionDescription>
          </RecordSectionHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-none border-0 border-b border-rule bg-transparent p-0 pb-2">
              {canDrafts && (
                <TabsTrigger value="drafts">
                  Drafts
                  <LaneCount loading={loading} count={laneTotal(counts, 'drafts', drafts.length)} />
                </TabsTrigger>
              )}
              {canReview && (
                <TabsTrigger value="review">
                  Needs Review
                  <LaneCount loading={loading} count={laneTotal(counts, 'review', review.length)} />
                </TabsTrigger>
              )}
              {canFinalize && (
                <TabsTrigger value="finalize">
                  Ready to Finalize
                  <LaneCount
                    loading={loading}
                    count={laneTotal(counts, 'finalize', finalize.length)}
                  />
                </TabsTrigger>
              )}
              {canCosignClinicalNotes ? (
                <TabsTrigger value="cosign">
                  Pending HAP Cosign
                  <LaneCount loading={loading} count={cosign.length} />
                </TabsTrigger>
              ) : null}
            </TabsList>
            {(
              [
                ['drafts', drafts],
                ['review', review],
                ['finalize', finalize],
                ...(canCosignClinicalNotes ? [['cosign', cosign] as const] : []),
              ] as const
            ).map(([lane, rows]) => (
              <TabsContent key={lane} value={lane} className="mt-0">
                <p className="py-3 text-sm text-muted-foreground">{LANE_COPY[lane]}</p>
                <QueueContent
                  rows={rows}
                  loading={loading}
                  unavailable={!isOnline || Boolean(error)}
                  columns={columns}
                  onRowClick={handleRowClick}
                />
                {lane !== 'cosign' && laneTotal(counts, lane, rows.length) > rows.length ? (
                  <div className="flex items-center justify-between gap-3 border-t border-rule py-3">
                    <p className="text-sm tabular-nums text-muted-foreground">
                      Showing {rows.length} of {laneTotal(counts, lane, rows.length)}
                    </p>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={loadingMore !== null || !isOnline}
                      onClick={() => void loadMore(lane)}
                    >
                      {loadingMore === lane ? 'Loading…' : 'Show more'}
                    </Button>
                  </div>
                ) : null}
              </TabsContent>
            ))}
          </Tabs>
        </RecordSection>
      </div>
    </RouteGuard>
  );
}

function QueueContent({
  rows,
  loading,
  unavailable,
  columns,
  onRowClick,
}: {
  rows: QueueRow[];
  loading: boolean;
  unavailable: boolean;
  columns: DataTableColumn<QueueRow>[];
  onRowClick: (row: { id: string }) => void;
}) {
  if (unavailable && rows.length === 0) return null;
  if (loading && rows.length === 0) {
    return (
      <div role="status" aria-label="Loading queues">
        <SectionSkeleton lines={4} />
      </div>
    );
  }
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title="Nothing in this queue"
        description="This lane is clear right now. Switch tabs or check back after the next clinical update."
      />
    );
  }

  return (
    <>
      <ul className="border-t border-rule md:hidden" aria-label="Encounters in this lane">
        {rows.map((row) => (
          <li key={row.id} className="border-b border-rule py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-sans text-sm font-semibold text-foreground">
                  {row.patientName}
                </h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{row.patientCode}</p>
              </div>
              <StatusLabel variant="outline" value={row.status} />
            </div>
            {row.bpStage || row.glucoseFlag ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {row.bpStage ? (
                  <span className="inline-flex items-center gap-1">
                    BP <StatusLabel value={row.bpStage} />
                  </span>
                ) : null}
                {row.glucoseFlag ? <GlucoseFlag /> : null}
              </div>
            ) : null}
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => onRowClick({ id: row.id })}
            >
              <ClipboardList className="h-4 w-4" />
              Open encounter
            </Button>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <DataTable
          caption="Encounters in this lane"
          columns={columns}
          data={rows}
          isRefreshing={loading}
          onRowClick={onRowClick}
          pageSizeOptions={[10, 25]}
        />
      </div>
    </>
  );
}

function LaneCount({ loading, count }: { loading: boolean; count: number }) {
  return loading ? null : <span className="ml-2 tabular-nums">{count}</span>;
}

/** Fasting 126 mg/dL or random 200 mg/dL and above, as the lane always flagged it. */
function GlucoseFlag() {
  return <StatusLabel variant="destructive" value="High glucose" />;
}
