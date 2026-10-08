'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import type { DiabetesScreeningRecord, VitalsRecord } from '@/lib/db';
import { OPS_DEFAULT_TIMEZONE, formatOpsDateTime } from '@/lib/ops';
import { fetchEncounterStationTimeline, type StationVisit } from '@/lib/stations';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EyeScreeningRecord } from '@/lib/eye-screening';
import { CounsellingForm, type CounsellingRecord } from './CounsellingForm';
import { EyeScreeningForm } from './EyeScreeningForm';
import { StationResultsSummary } from './StationResultsSummary';

const FOLLOW_UP_LABELS: Record<string, string> = {
  TODAY: 'today',
  WITHIN_1_WEEK: 'within 1 week',
  WITHIN_1_MONTH: 'within 1 month',
  WITHIN_3_MONTHS: 'within 3 months',
  OTHER: 'at another time',
};

/**
 * The doctor's view of a station-line session (#167): every station's results with who recorded
 * them, the route the patient took, and what the review station told them.
 *
 * A follow-up the volunteer recommended is not a scheduled one. The patient's reminder is created
 * from the care plan's follow-up date on finalize, so the doctor is asked to confirm it there.
 */
export function StationSessionPanel({
  clinicId,
  encounterId,
  vitals,
  diabetes,
  canEditCounselling,
  canSetCarePlan,
}: {
  clinicId: string;
  encounterId: string;
  vitals: VitalsRecord | null;
  diabetes: DiabetesScreeningRecord | null;
  canEditCounselling: boolean;
  canSetCarePlan: boolean;
}) {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const [timeline, setTimeline] = useState<StationVisit[] | null>(null);
  const [counselling, setCounselling] = useState<CounsellingRecord | null>(null);
  const [eye, setEye] = useState<EyeScreeningRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken || !isOnline) return;
    let current = true;
    fetchEncounterStationTimeline(clinicId, encounterId, getToken)
      .then((result) => current && setTimeline(result.items))
      .catch(
        (failure) =>
          current && setError(failure instanceof Error ? failure.message : String(failure)),
      );
    return () => {
      current = false;
    };
  }, [clinicId, encounterId, getToken, isOnline]);

  if (!isOnline) {
    return (
      <InlineNotice tone="warning" live={false}>
        The station session needs a connection to load.
      </InlineNotice>
    );
  }
  if (error) return <InlineNotice tone="error">{error}</InlineNotice>;
  if (!timeline) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!timeline.length) {
    return (
      <InlineNotice tone="info" live={false}>
        This encounter did not come through the station line.
      </InlineNotice>
    );
  }

  return (
    <div className="space-y-6">
      <StationResultsSummary
        timeline={timeline}
        vitals={vitals}
        diabetes={diabetes}
        eye={eye}
        timezone={OPS_DEFAULT_TIMEZONE}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Route through the stations</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {timeline.map((stop) => (
              <li key={stop.id} className="rounded-lg border p-3">
                <p className="font-medium">
                  {stop.station.name} · {stop.status.toLowerCase().replace('_', ' ')}
                  {stop.completedBy ? ` · ${stop.completedBy.displayName}` : ''}
                  {stop.completedAt
                    ? ` · ${formatOpsDateTime(stop.completedAt, OPS_DEFAULT_TIMEZONE)}`
                    : ''}
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
      {counselling?.followUpRecommended && canSetCarePlan ? (
        <InlineNotice tone="warning" live={false}>
          The review station recommended follow-up{' '}
          {FOLLOW_UP_LABELS[counselling.followUpWindow] ?? ''}
          {counselling.followUpOther ? ` (${counselling.followUpOther})` : ''}. Set the follow-up
          date in the care plan before finalizing, or no reminder is scheduled.
        </InlineNotice>
      ) : null}
      {timeline.some((stop) => stop.station.kind === 'EYE') ? (
        <EyeScreeningForm
          clinicId={clinicId}
          encounterId={encounterId}
          canEdit={canEditCounselling}
          onLoaded={setEye}
          onSaved={setEye}
        />
      ) : null}
      <CounsellingForm
        clinicId={clinicId}
        encounterId={encounterId}
        canEdit={canEditCounselling}
        onLoaded={setCounselling}
        onSaved={setCounselling}
      />
    </div>
  );
}
