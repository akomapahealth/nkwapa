import { STATION_KIND_LABELS } from '@nkwapa/db/clinic-stations';
import type { ClinicReadiness, ReadinessState } from './stations';

export interface ReadinessRow {
  id: keyof ClinicReadiness['checks'];
  state: ReadinessState;
  title: string;
  /** What is wrong and what to do, or why the check does not apply. */
  detail: string;
  link?: { href: string; label: string };
}

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const ON_SHIFT = { href: '#on-shift', label: 'See who is on shift' };

/**
 * The morning checks in the order a manager works through them (#411). The card and the copied
 * checklist both read these rows. Station and staff names only; nothing names a patient.
 */
export function readinessRows(readiness: ClinicReadiness): ReadinessRow[] {
  const { stations, staffed, doctorAtReview, synced, offline, yesterdayClosed } = readiness.checks;
  // Review has its own sentence below.
  const closedKinds = stations.kindsClosed
    .filter((kind) => kind !== 'REVIEW')
    .map((kind) => STATION_KIND_LABELS[kind]);
  return [
    {
      id: 'stations',
      state: stations.state,
      title: 'Stations open',
      detail:
        stations.state === 'PASS'
          ? `${stations.activeCount} open, with one review station.`
          : stations.activeCount === 0
            ? 'No station is open.'
            : [
                closedKinds.length ? `No open ${list(closedKinds)} station.` : '',
                stations.reviewCount === 0
                  ? 'No review station is open.'
                  : stations.reviewCount > 1
                    ? `${stations.reviewCount} review stations are open; keep one.`
                    : '',
              ]
                .filter(Boolean)
                .join(' '),
      link:
        stations.state === 'WARN'
          ? { href: '/stations/setup', label: 'Set up stations' }
          : undefined,
    },
    {
      id: 'staffed',
      state: staffed.state,
      title: 'Every station staffed',
      detail:
        staffed.state === 'NA'
          ? 'No station is open yet.'
          : staffed.state === 'PASS'
            ? 'Someone is at every open station.'
            : `Nobody at ${list(staffed.stations.map((station) => station.name))}.`,
      link: staffed.state === 'WARN' ? ON_SHIFT : undefined,
    },
    {
      id: 'doctorAtReview',
      state: doctorAtReview.state,
      title: 'Doctor at review',
      detail:
        doctorAtReview.state === 'NA'
          ? 'No review station is open.'
          : doctorAtReview.state === 'PASS'
            ? 'A doctor or manager is at review.'
            : 'No doctor or manager has chosen the review station.',
      link: doctorAtReview.state === 'WARN' ? ON_SHIFT : undefined,
    },
    {
      id: 'synced',
      state: synced.state,
      title: 'Devices synced',
      detail:
        synced.state === 'NA'
          ? 'Nobody is on shift yet.'
          : synced.state === 'PASS'
            ? `Everyone on shift synced in the last ${readiness.syncMinutes} minutes.`
            : `Not synced in ${readiness.syncMinutes} minutes: ${list(synced.people)}. Ask them to open Nkwapa with a connection.`,
    },
    {
      id: 'offline',
      state: offline.state,
      title: 'Offline access ready',
      detail:
        offline.state === 'NA'
          ? 'Offline access is off for this deployment, or nobody is on shift.'
          : offline.state === 'PASS'
            ? 'Everyone on shift can keep working offline.'
            : `No offline access yet: ${list(offline.people)}. Ask them to turn it on in Settings, Offline access, while online.`,
    },
    {
      id: 'yesterdayClosed',
      state: yesterdayClosed.state,
      title: 'Earlier days closed',
      detail:
        yesterdayClosed.state === 'PASS'
          ? 'Nobody is left open from an earlier day.'
          : `${yesterdayClosed.openCheckIns} ${yesterdayClosed.openCheckIns === 1 ? 'patient is' : 'patients are'} still open from an earlier day. End that day from the board.`,
    },
  ];
}

const MARK: Record<ReadinessState, string> = { PASS: 'OK', WARN: 'CHECK', NA: 'n/a' };

/** Plain text for the team WhatsApp group: one line per check. */
export function readinessText(readiness: ClinicReadiness, clinicName: string): string {
  const rows = readinessRows(readiness);
  const passing = rows.filter((row) => row.state === 'PASS').length;
  const applicable = rows.filter((row) => row.state !== 'NA').length;
  return [
    `${clinicName}: ready to open, ${readiness.date} (${passing} of ${applicable} checks pass)`,
    ...rows.map((row) => `[${MARK[row.state]}] ${row.title}: ${row.detail}`),
  ].join('\n');
}
