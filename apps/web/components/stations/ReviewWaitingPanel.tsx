'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewWaitingList } from '@/components/stations/ReviewWaitingList';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getTodayInTimeZone } from '@/lib/ops';
import {
  claimStationVisit,
  fetchStationBoard,
  usePolling,
  useReviewWaitingCount,
  type StationVisit,
} from '@/lib/stations';

/**
 * The review waiting list on a doctor's dashboard (#419), shown only while they are on shift at
 * the review station. The cheap count says whether they are; only then is the board read.
 */
export function ReviewWaitingPanel({ clinicId }: { clinicId: string }) {
  const getToken = useAuth();
  const router = useRouter();
  const userId = useBootstrap()?.bootstrap?.userId;
  const atReview = useReviewWaitingCount(clinicId, getToken, true) !== null;
  const [visits, setVisits] = useState<StationVisit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [date] = useState(getTodayInTimeZone);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!getToken || !atReview) return;
    try {
      const board = await fetchStationBoard(clinicId, date, getToken);
      const mine = board.stations.find(
        (station) => station.kind === 'REVIEW' && station.staff.some((s) => s.id === userId),
      );
      setVisits(mine?.visits ?? null);
    } catch {
      // Keep the last list; the next poll tries again.
    }
  }, [atReview, clinicId, date, getToken, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, atReview);

  const take = async (visit: StationVisit) => {
    if (!getToken || inFlight.current) return;
    inFlight.current = true;
    setBusyId(visit.id);
    setError(null);
    try {
      await claimStationVisit(clinicId, visit.id, getToken);
      router.push(`/stations/visits/${visit.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      inFlight.current = false;
      setBusyId(null);
      void refresh();
    }
  };

  if (!atReview || !visits) return null;
  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <ReviewWaitingList
        visits={visits}
        canTake={busyId === null}
        busyId={busyId}
        onTake={(visit) => void take(visit)}
      />
    </div>
  );
}
