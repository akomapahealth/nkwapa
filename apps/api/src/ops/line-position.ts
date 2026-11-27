import type { CheckInStatus, Prisma } from '@prisma/client';

type Reader = Pick<Prisma.TransactionClient, 'patientStationVisit'>;

/** Where a checked-in patient is right now (#414): the station, and who has them. */
export interface LinePosition {
  checkInId: string;
  status: CheckInStatus;
  dayNumber: number | null;
  /** Null when the patient is not at a station: the station line is off, or they are done. */
  stationName: string | null;
  /** Who is seeing them; null while they wait in the station's queue. */
  holderName: string | null;
  /** Taken by the holder, or joined the queue, whichever applies. */
  since: string | null;
}

/** The open station stop of each check-in, read in one query. */
export async function linePositions(
  db: Reader,
  checkIns: Array<{ id: string; status: CheckInStatus; dayNumber: number | null }>,
): Promise<Map<string, LinePosition>> {
  const visits = checkIns.length
    ? await db.patientStationVisit.findMany({
        where: {
          patientCheckInId: { in: checkIns.map((checkIn) => checkIn.id) },
          status: { in: ['QUEUED', 'IN_PROGRESS'] },
        },
        select: {
          patientCheckInId: true,
          status: true,
          queuedAt: true,
          claimedAt: true,
          station: { select: { name: true } },
          claimedBy: { select: { displayName: true } },
        },
        orderBy: { queuedAt: 'asc' },
      })
    : [];
  // A patient has one open stop; should two exist, the later one is where they went.
  const open = new Map(visits.map((visit) => [visit.patientCheckInId, visit]));
  return new Map(
    checkIns.map((checkIn) => {
      const visit = open.get(checkIn.id);
      const held = visit?.status === 'IN_PROGRESS';
      return [
        checkIn.id,
        {
          checkInId: checkIn.id,
          status: checkIn.status,
          dayNumber: checkIn.dayNumber,
          stationName: visit?.station.name ?? null,
          holderName: held ? (visit.claimedBy?.displayName ?? null) : null,
          since: (held ? visit.claimedAt : visit?.queuedAt)?.toISOString() ?? null,
        },
      ];
    }),
  );
}

/**
 * The duplicate check-in refusal, saying where the patient already is so the volunteer can go and
 * find them (#414): "Already on the line: No. 14 at Glucose, with Ama since 9:42 AM."
 */
export function alreadyCheckedInMessage(position: LinePosition, timeZone: string): string {
  const number = position.dayNumber ? `No. ${position.dayNumber}` : 'This patient';
  const since = position.since
    ? ` since ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(position.since))}`
    : '';
  if (position.stationName && position.holderName) {
    return `Already on the line: ${number} at ${position.stationName}, with ${position.holderName}${since}.`;
  }
  if (position.stationName) {
    return `Already on the line: ${number}, waiting at ${position.stationName}${since}.`;
  }
  return `Already checked in today: ${number}. Find them on the Today board.`;
}
