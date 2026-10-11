import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv';

/**
 * The tabs the importer reads, with their headers exactly as build_screening_sheet.py writes them.
 * A renamed or reordered column fails the whole load: mapping by a header that silently moved
 * would put one field's answers into another.
 */
export const TABS = {
  checkIn: {
    name: 'Check-In',
    headers: [
      'Visit ID',
      'Arrived',
      'First name',
      'Last name',
      'Full name',
      'Sex',
      'Date of birth',
      'Age (yrs)',
      'Phone',
      'ID type',
      'ID number',
      'Region',
      'District',
      'Community / town',
      'Research consent',
      'Nkwapa code (returning)',
      'Checked in by',
      'Current station',
      'Status',
      'Now with',
      'Alerts',
      'Notes',
    ],
  },
  intake: {
    name: '1 Intake',
    headers: [
      'Visit ID',
      'Patient',
      'Known high BP?',
      'Known diabetes?',
      'Other conditions',
      'Current medicines',
      'Takes medicines as prescribed?',
      'Allergies',
      'Family history (BP, diabetes, stroke, heart)',
      'Smoking',
      'Smokeless tobacco',
      'Second-hand smoke',
      'Ready to quit?',
      'Alcohol',
      'Pregnant?',
      'Main concern today',
      'Recorded by',
      'Time',
    ],
  },
  bp: {
    name: '2 Blood Pressure',
    headers: [
      'Visit ID',
      'Patient',
      'Systolic 1',
      'Diastolic 1',
      'Pulse 1',
      'Systolic 2',
      'Diastolic 2',
      'Pulse 2',
      'Arm',
      'Position',
      'Cuff size',
      'Avg systolic',
      'Avg diastolic',
      'Category',
      'Alert',
      'Recorded by',
      'Time',
      'Notes',
    ],
  },
  glucose: {
    name: '3 Glucose',
    headers: [
      'Visit ID',
      'Patient',
      'Glucose (mg/dL)',
      'mmol/L',
      'Test type',
      'Last ate (time)',
      'Frequent urination',
      'Excess thirst',
      'Weight loss (unexplained)',
      'Blurred vision',
      'Slow-healing wounds',
      'Numb / tingling feet',
      'Foot wound now?',
      'Result',
      'Alert',
      'Recorded by',
      'Time',
      'Notes',
    ],
  },
  body: {
    name: '4 Body & Vitals',
    headers: [
      'Visit ID',
      'Patient',
      'Weight (kg)',
      'Height (cm)',
      'BMI',
      'BMI category',
      'Waist (cm)',
      'Temp (°C)',
      'SpO₂ (%)',
      'Resp. rate',
      'Alert',
      'Recorded by',
      'Time',
      'Notes',
    ],
  },
  eye: {
    name: '5 Eye',
    headers: [
      'Visit ID',
      'Patient',
      'Eye complaint?',
      'Complaint details',
      'Wears glasses?',
      'VA right (OD) unaided',
      'VA left (OS) unaided',
      'VA both (OU) unaided',
      'VA right with glasses',
      'VA left with glasses',
      'VA right pinhole',
      'VA left pinhole',
      'Cup:disc right',
      'Cup:disc left',
      'Abnormal findings (eye + structure)',
      'Likely cause of reduced vision',
      'Diabetic signs?',
      'Hypertensive signs?',
      'Referral?',
      'Referral note',
      'Alert',
      'Examined by',
      'Time',
      'Notes',
    ],
  },
  review: {
    name: '6 Review',
    headers: [
      'Visit ID',
      'Patient',
      "Today's alerts",
      'BP',
      'Diabetes',
      'Weight & diet',
      'Activity',
      'Tobacco',
      'Alcohol',
      'Medicines',
      'Other topic',
      'Advice given',
      'Follow-up?',
      'Follow-up when',
      'Referral?',
      'Referred to',
      'Referral reason',
      'Urgency',
      'Medicines prescribed / given',
      'Reviewed by',
      'Time',
      'Notes',
    ],
  },
} as const;

export type TabKey = keyof typeof TABS;
export type TabRow = Record<string, string>;

/** One patient's day: their row from every tab, keyed by header. Missing tabs are empty rows. */
export interface SheetPatient {
  visitId: string;
  tabs: Record<TabKey, TabRow>;
}

/** Columns the volunteers never type in: formulas and the copied patient name. */
const DERIVED = new Set(['Visit ID', 'Patient', 'Full name', 'Alerts', "Today's alerts"]);

export function hasEntries(row: TabRow, ignore: string[] = []): boolean {
  return Object.entries(row).some(
    ([header, value]) => !DERIVED.has(header) && !ignore.includes(header) && value.trim() !== '',
  );
}

export function tabFromCsv(key: TabKey, text: string): Map<string, TabRow> {
  const { name, headers } = TABS[key];
  const [head, ...body] = parseCsv(text);
  const actual = (head ?? []).map((h) => h.trim());
  const expected = headers as readonly string[];
  if (actual.length < expected.length || expected.some((h, i) => actual[i] !== h)) {
    throw new Error(
      `${name}: the columns are not the ones the sheet was built with. Expected "${expected.join(' | ')}", got "${actual.join(' | ')}".`,
    );
  }
  const rows = new Map<string, TabRow>();
  for (const cells of body) {
    const visitId = (cells[0] ?? '').trim();
    if (!visitId) continue;
    if (rows.has(visitId)) throw new Error(`${name}: ${visitId} appears twice`);
    rows.set(visitId, Object.fromEntries(expected.map((h, i) => [h, (cells[i] ?? '').trim()])));
  }
  return rows;
}

function emptyRow(key: TabKey, visitId: string): TabRow {
  return Object.fromEntries(
    TABS[key].headers.map((h) => [h, h === 'Visit ID' ? visitId : '']),
  ) as TabRow;
}

export interface LoadedSheet {
  patients: SheetPatient[];
  /** Visit IDs with station data but no first name on Check-In. */
  orphans: Array<{ visitId: string; tabs: string[] }>;
}

export function joinTabs(tabs: Record<TabKey, Map<string, TabRow>>): LoadedSheet {
  const keys = Object.keys(TABS) as TabKey[];
  const visitIds = new Set(keys.flatMap((k) => [...tabs[k].keys()]));
  const patients: SheetPatient[] = [];
  const orphans: LoadedSheet['orphans'] = [];
  for (const visitId of [...visitIds].sort()) {
    const row = Object.fromEntries(
      keys.map((k) => [k, tabs[k].get(visitId) ?? emptyRow(k, visitId)]),
    ) as Record<TabKey, TabRow>;
    if (row.checkIn['First name']) {
      patients.push({ visitId, tabs: row });
      continue;
    }
    const withData = keys.filter((k) => k !== 'checkIn' && hasEntries(row[k]));
    if (withData.length > 0) orphans.push({ visitId, tabs: withData.map((k) => TABS[k].name) });
  }
  return { patients, orphans };
}

/**
 * Read the per-tab CSVs (File → Download → CSV, one per tab). Google names them
 * "<spreadsheet> - <tab>.csv"; a file named just "<tab>.csv" works too.
 */
export function loadSheet(dir: string): LoadedSheet {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  const tabs = {} as Record<TabKey, Map<string, TabRow>>;
  for (const key of Object.keys(TABS) as TabKey[]) {
    const { name } = TABS[key];
    const matches = files.filter((f) => f === `${name}.csv` || f.endsWith(` - ${name}.csv`));
    if (matches.length !== 1) {
      throw new Error(
        `Expected one CSV for the "${name}" tab in ${dir}, found ${matches.length ? matches.join(', ') : 'none'}`,
      );
    }
    tabs[key] = tabFromCsv(key, readFileSync(join(dir, matches[0]), 'utf8'));
  }
  return joinTabs(tabs);
}
