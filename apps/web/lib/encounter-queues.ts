/** Queue lanes page through the API 50 at a time; the tab count comes from /encounters/counts (#307). */

export const QUEUE_PAGE_SIZE = 50;

export type EncounterQueueStage = 'DRAFT' | 'REVIEW' | 'DOCTOR_READY';

export interface EncounterQueueCounts {
  drafts: number;
  review: number;
  finalize: number;
}

export function encounterQueueQuery(stage: EncounterQueueStage, skip = 0) {
  const params = new URLSearchParams(
    stage === 'DRAFT' ? { status: 'DRAFT' } : { status: 'IN_REVIEW', stage },
  );
  params.set('take', String(QUEUE_PAGE_SIZE));
  if (skip > 0) params.set('skip', String(skip));
  return params.toString();
}

/** The lane's true size; the loaded rows only when the count could not be read. */
export function laneTotal(
  counts: EncounterQueueCounts | null,
  lane: keyof EncounterQueueCounts,
  loaded: number,
) {
  return counts ? Math.max(counts[lane], loaded) : loaded;
}
