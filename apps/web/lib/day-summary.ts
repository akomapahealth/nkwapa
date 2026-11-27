import { formatMinutes, type ClinicDaySummary } from './stations';

export type DaySummarySection = 'Patients' | 'Clinical' | 'Line' | 'Open work' | 'Staff';

export interface DaySummaryRow {
  section: DaySummarySection;
  label: string;
  value: string;
}

/** The busiest clinic-local hour by check-ins, as "09:00", or null on an empty day. */
export function busiestHour(summary: ClinicDaySummary): string | null {
  let best: { hour: string; checkedIn: number } | null = null;
  for (const hour of summary.metrics.hourly) {
    if (hour.checkedIn > 0 && (!best || hour.checkedIn > best.checkedIn)) best = hour;
  }
  return best?.hour ?? null;
}

/**
 * Every figure on the day summary, in page order. The page, the copied text and the CSV all read
 * these rows, so none of them can show something the others do not. Counts and times only: there
 * is nothing here that names a patient, a code, a phone number or a member of staff.
 */
export function daySummaryRows(summary: ClinicDaySummary): DaySummaryRow[] {
  const { metrics, patients, clinical, openWork, staff } = summary;
  const count = (value: number) => String(value);
  const rows: DaySummaryRow[] = [
    { section: 'Patients', label: 'Checked in', value: count(metrics.checkIns.total) },
    { section: 'Patients', label: 'Finished review', value: count(metrics.checkIns.completed) },
    { section: 'Patients', label: 'Left early', value: count(metrics.checkIns.leftEarly) },
    {
      section: 'Patients',
      label: 'Closed at day end',
      value: count(metrics.checkIns.closedAtDayEnd),
    },
    { section: 'Patients', label: 'New', value: count(patients.new) },
    { section: 'Patients', label: 'Returning', value: count(patients.returning) },
    {
      section: 'Clinical',
      label: 'Referrals: urgent',
      value: count(clinical.referrals.urgent),
    },
    { section: 'Clinical', label: 'Referrals: soon', value: count(clinical.referrals.soon) },
    {
      section: 'Clinical',
      label: 'Referrals: routine',
      value: count(clinical.referrals.routine + clinical.referrals.unspecified),
    },
    { section: 'Clinical', label: 'BP to refer today', value: count(clinical.bpReferToday) },
    { section: 'Clinical', label: 'BP to recheck', value: count(clinical.bpRecheck) },
    {
      section: 'Clinical',
      label: 'Glucose to refer today',
      value: count(clinical.glucoseReferToday),
    },
    { section: 'Clinical', label: 'Glucose raised', value: count(clinical.glucoseRaised) },
    {
      section: 'Line',
      label: 'Median time in clinic',
      value: formatMinutes(metrics.timeInClinic.medianMinutes),
    },
    { section: 'Line', label: 'Busiest hour', value: busiestHour(summary) ?? '–' },
  ];
  for (const station of metrics.stations) {
    rows.push(
      {
        section: 'Line',
        label: `${station.name}: wait, median / 90th`,
        value: `${formatMinutes(station.wait.medianMinutes)} / ${formatMinutes(station.wait.p90Minutes)}`,
      },
      { section: 'Line', label: `${station.name}: patients taken`, value: count(station.seen) },
      {
        section: 'Line',
        label: `${station.name}: handed on with nothing recorded`,
        value: count(station.heldEmpty),
      },
      {
        section: 'Line',
        label: `${station.name}: longest with one patient`,
        value: formatMinutes(station.longestHeldMinutes),
      },
    );
  }
  rows.push(
    { section: 'Open work', label: 'Draft encounters', value: count(openWork.drafts) },
    { section: 'Open work', label: 'Encounters in review', value: count(openWork.inReview) },
    {
      section: 'Open work',
      label: 'Notes waiting for cosign',
      value: count(openWork.notesToCosign),
    },
    { section: 'Staff', label: 'Volunteers on shift', value: count(staff.volunteers) },
    { section: 'Staff', label: 'Doctors on shift', value: count(staff.doctors) },
    { section: 'Staff', label: 'Managers on shift', value: count(staff.managers) },
  );
  return rows;
}

/** Plain text for WhatsApp or email: a heading, then each section's figures. */
export function daySummaryText(summary: ClinicDaySummary, clinicName: string): string {
  const lines = [`${clinicName}: clinic day ${summary.metrics.date}`];
  let section: DaySummarySection | null = null;
  for (const row of daySummaryRows(summary)) {
    if (row.section !== section) {
      section = row.section;
      lines.push('', `${section}`);
    }
    lines.push(`- ${row.label}: ${row.value}`);
  }
  if (summary.demoCheckIns > 0) {
    lines.push('', `Not counted above: ${summary.demoCheckIns} practice (demo) check-ins.`);
  }
  return lines.join('\n');
}

/** One row per figure, for comparing screening days in a spreadsheet. */
export function daySummaryCsvRows(summary: ClinicDaySummary): string[][] {
  return [
    ['date', 'section', 'metric', 'value'],
    ...daySummaryRows(summary).map((row) => [
      summary.metrics.date,
      row.section,
      row.label,
      row.value,
    ]),
    [
      summary.metrics.date,
      'Patients',
      'Demo check-ins (not counted above)',
      String(summary.demoCheckIns),
    ],
  ];
}
