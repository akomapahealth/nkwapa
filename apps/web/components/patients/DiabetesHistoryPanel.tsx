'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, Droplets, ExternalLink, UserRound } from 'lucide-react';
import { DIABETES_SYMPTOM_LABELS, type DiabetesSymptom } from '@nkwapa/db';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, readApiError } from '@/lib/api';
import { db, type DiabetesScreeningRecord } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { InlineNotice } from '@/components/ops/OpsShared';
import {
  ChartSectionEmpty,
  ChartSectionError,
  ChartSectionLoading,
  ChartSectionOffline,
} from '@/components/patients/chart/ChartSectionState';

interface DiabetesHistoryItem {
  id: string;
  clinicId: string;
  patientId: string;
  glucoseMgDl: number | null;
  glucoseType: 'FASTING' | 'RANDOM' | 'UNKNOWN';
  hba1cPercent: number | null;
  symptoms: DiabetesSymptom[];
  notes: string | null;
  collectedAt: string;
  author: { id: string; displayName: string } | null;
  sourceEncounter: { id: string; createdAt: string; status: string };
  legacySymptomsUnmapped: boolean;
  isEditable: boolean;
}

function contextLabel(value: DiabetesHistoryItem['glucoseType']): string {
  if (value === 'FASTING') return 'Fasting';
  if (value === 'RANDOM') return 'Random';
  return 'Unknown / not documented';
}

function fromLocal(
  record: DiabetesScreeningRecord,
  encounterStatus = 'DRAFT',
): DiabetesHistoryItem {
  return {
    id: record.id,
    clinicId: record.clinicId,
    patientId: '',
    glucoseMgDl: record.glucoseMgDl ?? null,
    glucoseType: (record.glucoseType as DiabetesHistoryItem['glucoseType']) ?? 'UNKNOWN',
    hba1cPercent: record.hba1cPercent ?? null,
    symptoms: record.symptoms ?? [],
    notes: record.notes ?? null,
    collectedAt: record.collectedAt ?? record.createdAt ?? new Date().toISOString(),
    author: record.authoredBy ?? null,
    sourceEncounter: {
      id: record.encounterId,
      createdAt: record.createdAt ?? new Date().toISOString(),
      status: record.encounterStatus ?? encounterStatus,
    },
    legacySymptomsUnmapped: record.legacySymptomsUnmapped ?? false,
    isEditable: encounterStatus !== 'FINALIZED',
  };
}

export function DiabetesHistoryPanel({
  clinicId,
  patientId,
  currentEncounterId,
}: {
  clinicId: string;
  patientId: string;
  currentEncounterId?: string;
}) {
  const getToken = useAuth();
  const [items, setItems] = useState<DiabetesHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Whether what is on screen came from this device rather than the server. Falling back to the
  // cache silently made stale screenings indistinguishable from current ones.
  const [servedFromCache, setServedFromCache] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setServedFromCache(false);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/diabetes-screenings?limit=100`,
        { getToken, activeClinicId: clinicId },
      );
      if (!response.ok) throw await readApiError(response);
      const payload = (await response.json()) as { items: DiabetesHistoryItem[] };
      setItems(payload.items);
    } catch (loadError) {
      const encounters = await db.encounters.where('patientId').equals(patientId).toArray();
      const statusByEncounter = new Map(
        encounters.map((encounter) => [encounter.id, encounter.status]),
      );
      const encounterIds = new Set(
        encounters
          .filter((encounter) => encounter.clinicId === clinicId)
          .map((encounter) => encounter.id),
      );
      const cached = (await db.diabetes_screenings.where('clinicId').equals(clinicId).toArray())
        .filter((record) => encounterIds.has(record.encounterId))
        .map((record) => fromLocal(record, statusByEncounter.get(record.encounterId)))
        .sort(
          (left, right) =>
            new Date(right.collectedAt).getTime() - new Date(left.collectedAt).getTime(),
        );
      setItems(cached);
      if (cached.length === 0) {
        setError(
          loadError instanceof Error ? loadError.message : 'Unable to load diabetes history.',
        );
      } else {
        setServedFromCache(true);
      }
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = currentEncounterId
    ? items.find((item) => item.sourceEncounter.id === currentEncounterId)
    : undefined;
  const history = currentEncounterId
    ? items.filter((item) => item.sourceEncounter.id !== currentEncounterId)
    : items;

  const renderRecord = (item: DiabetesHistoryItem, currentRecord = false) => (
    <li key={item.id} className="rounded-3xl border border-border/80 bg-background/75 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {currentRecord ? <Badge>Current encounter</Badge> : null}
            <Badge variant="outline">{contextLabel(item.glucoseType)}</Badge>
            <Badge variant={item.sourceEncounter.status === 'FINALIZED' ? 'default' : 'secondary'}>
              {item.sourceEncounter.status.replaceAll('_', ' ')}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <p className="text-lg font-semibold">
              {item.glucoseMgDl == null ? 'No glucose value' : `${item.glucoseMgDl} mg/dL`}
            </p>
            <p className="text-lg font-semibold">
              {item.hba1cPercent == null ? 'No HbA1c value' : `HbA1c ${item.hba1cPercent}%`}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              <time dateTime={item.collectedAt}>{new Date(item.collectedAt).toLocaleString()}</time>
            </span>
            <span className="inline-flex items-center gap-2">
              <UserRound className="h-4 w-4" aria-hidden="true" />
              {item.author?.displayName ?? 'Author unavailable offline'}
            </span>
          </div>
          {item.symptoms.length ? (
            <div className="flex flex-wrap gap-2" aria-label="Recorded symptoms">
              {item.symptoms.map((symptom) => (
                <Badge key={symptom} variant="secondary">
                  {DIABETES_SYMPTOM_LABELS[symptom]}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No symptoms selected.</p>
          )}
          {item.notes ? (
            <p className="whitespace-pre-wrap text-sm leading-6">{item.notes}</p>
          ) : null}
          {item.legacySymptomsUnmapped ? (
            <InlineNotice tone="info">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Some legacy symptom content could not be mapped. The original content is preserved.
            </InlineNotice>
          ) : null}
        </div>
        <Button asChild variant="outline" className="shrink-0 rounded-2xl">
          <Link href={`/clinics/${clinicId}/encounters/${item.sourceEncounter.id}`}>
            Open source visit <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </li>
  );

  return (
    <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <h2 className="text-lg font-semibold">Longitudinal diabetes history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Staff-recorded screenings remain linked to their source visits. Patient-entered portal
            measurements are unchanged and stay in Trends.
          </p>
        </div>
        <Droplets className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <ChartSectionError
            title="Unable to load diabetes history"
            description={error}
            onRetry={load}
          />
        ) : null}
        {servedFromCache ? (
          <ChartSectionOffline
            title="Showing screenings saved on this device"
            description="This history could not be refreshed from the server, so it may be missing recent screenings recorded elsewhere."
          />
        ) : null}
        {loading ? <ChartSectionLoading label="diabetes history" /> : null}
        {!loading && currentEncounterId ? (
          <section aria-labelledby="current-diabetes-record" className="space-y-3">
            <h3
              id="current-diabetes-record"
              className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              Current encounter
            </h3>
            {current ? (
              <ul>{renderRecord(current, true)}</ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No diabetes screening has been saved for this encounter.
              </p>
            )}
          </section>
        ) : null}
        <section aria-labelledby="previous-diabetes-records" className="space-y-3">
          <h3
            id="previous-diabetes-records"
            className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            {currentEncounterId ? 'Previous screenings' : 'Screening history'}
          </h3>
          {!loading && history.length === 0 ? (
            <ChartSectionEmpty
              title="No previous diabetes screenings"
              description="A chronological history will appear after staff save screenings in encounters."
            />
          ) : (
            <ol className="space-y-3">{history.map((item) => renderRecord(item))}</ol>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
