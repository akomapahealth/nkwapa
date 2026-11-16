import { Prisma } from '@prisma/client';
import { CLINIC_DEFAULT_TIMEZONE, todayInTimeZone } from '@nkwapa/db';
import type { PrismaService } from '../prisma/prisma.service';
import { str } from '../clinical-notes/narrative/narrative-text';
import type {
  ChartGlance,
  ChartGlanceScreeningKind,
  PatientChartSummary,
} from './dto/patient-chart.dto';

/*
  The Overview's "At a glance" block (#341), and the payload the referral report (#344) reuses.

  Every line comes from a recorded value by a fixed rule below; nothing is generated. Each part is
  null when the caller cannot read the section it comes from, like the rest of the summary.

  The reads are one SQL statement. A request runs inside one RLS transaction, so Prisma queries
  run one after another however they are awaited; fifteen small lookups cost fifteen round trips,
  measurably slowing the chart. A part the caller cannot read is NULL in the SQL, never fetched.
*/

export type TrendDirection = 'RISING' | 'FALLING' | 'STEADY' | 'NOT_ENOUGH_DATA';

/** Systolic change, in mmHg, that counts as movement rather than measurement noise. */
export const BP_DEAD_BAND_MMHG = 10;
/**
 * Glucose change that counts as movement: 18 mg/dL, 1.0 mmol/L. Meters are allowed ±15% (ISO
 * 15197) and fasting values drift day to day by about this much, so a smaller change is not a
 * trend a clinician should act on.
 */
export const GLUCOSE_DEAD_BAND_MG_DL = 18;
/** A pregnancy answer older than a term is not "pregnant now". */
export const PREGNANCY_CURRENT_DAYS = 280;

/**
 * The latest value against the mean of the two before it. Fewer than three readings is not a
 * direction. A change of exactly the dead band is steady.
 */
export function trendDirection(
  latest: number | null | undefined,
  previous: readonly number[],
  deadBand: number,
): TrendDirection {
  if (latest == null || previous.length < 2) return 'NOT_ENOUGH_DATA';
  const delta = latest - (previous[0] + previous[1]) / 2;
  if (delta > deadBand) return 'RISING';
  if (delta < -deadBand) return 'FALLING';
  return 'STEADY';
}

const ADHERENCE_SEVERITY = ['NOT_TAKING', 'SOMETIMES', 'UNSURE', 'ALWAYS'] as const;

/** One visit's adherence as its worst answer across medicines; unasked answers are ignored. */
export function worstAdherence(levels: readonly string[]): string | null {
  return ADHERENCE_SEVERITY.find((level) => levels.includes(level)) ?? null;
}

const HYPERTENSION_NAME = /hypertension|high blood pressure|\bhtn\b/i;
const DIABETES_NAME = /diabet|\bt[12]?dm\b|\bdm\b/i;

/**
 * Active history conditions, minus the ones the latest assessments already state, and minus
 * repeats. "Hypertension" in the history and a known-hypertension assessment are one fact.
 */
export function dedupeConditions(
  names: readonly string[],
  stated: { hypertension: boolean; diabetes: boolean },
): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    if (stated.hypertension && HYPERTENSION_NAME.test(name)) return false;
    if (stated.diabetes && DIABETES_NAME.test(name)) return false;
    return true;
  });
}

const STATED_HYPERTENSION = ['KNOWN_HYPERTENSION', 'NEWLY_ELEVATED_BP'];
const STATED_DIABETES = ['KNOWN_DIABETES', 'NEWLY_ELEVATED_GLUCOSE'];

/**
 * Where the latest follow-up date stands today, in clinic-local days. A visit on or after the
 * due day meets it; a due day before today with no such visit is overdue.
 */
export function followUpState(
  dueOn: string,
  today: string,
  lastVisitOn: string | null,
): 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'MET' {
  if (lastVisitOn && lastVisitOn >= dueOn) return 'MET';
  if (dueOn > today) return 'UPCOMING';
  return dueOn === today ? 'DUE_TODAY' : 'OVERDUE';
}

export interface GlanceAccess {
  /** Section ids the caller may read (vitals, medications, medical-history, visits, ...). */
  has: (section: string) => boolean;
  /** SCREENING.READ: BP, glucose, tobacco, eye and pregnancy. */
  screening: boolean;
  counselling: boolean;
}

type At = string; // timestamptz rendered in JSON, with its offset

/** One row from `loadGlanceRow`; a column is null when gated off or when nothing is recorded. */
export interface GlanceRow {
  history: Array<{ category: string; details: Record<string, unknown> | null }> | null;
  hypertension_status: string | null;
  diabetes: { status: string; type: string } | null;
  pregnancy: { answer: string; at: At } | null;
  bp: Array<{
    systolic: number;
    diastolic: number;
    repeatSystolic: number | null;
    repeatDiastolic: number | null;
    at: At;
  }> | null;
  glucose_latest: { mgDl: number; type: string; at: At } | null;
  glucose_previous: Array<{ mgDl: number; at: At }> | null;
  hba1c: { percent: number; at: At } | null;
  adherence: { levels: string[]; at: At } | null;
  tobacco: { smoking: string; smokeless: string; at: At } | null;
  eye_at: Date | null;
  counselling_at: Date | null;
  follow_up_at: Date | null;
  timezone: string | null;
}

const NULL = Prisma.sql`NULL`;
const gate = (allowed: boolean, column: Prisma.Sql) => (allowed ? column : NULL);

/** Every glance read in one statement, scoped to the clinic and the patient. */
export async function loadGlanceRow(
  prisma: PrismaService,
  clinicId: string,
  patientId: string,
  access: GlanceAccess,
): Promise<GlanceRow> {
  const c = Prisma.sql`${clinicId}::uuid`;
  const p = Prisma.sql`${patientId}::uuid`;
  /*
    The newest `limit` rows of an encounter-linked table, visit by visit. Each table's RLS policy
    runs a correlated check per row, so a lookup that joined and sorted every record cost about a
    millisecond on a 50-visit chart. Walking the visits newest first lets Postgres stop at the
    first match, so the check runs only on the rows taken.
  */
  const latest = (table: string, where: Prisma.Sql, columns: Prisma.Sql, limit = 1) =>
    Prisma.sql`SELECT ${columns}, o."createdAt" AS visit_at, o.id AS visit_id
      FROM enc o
      CROSS JOIN LATERAL (
        SELECT * FROM ${Prisma.raw(`"${table}"`)} r
        WHERE r."encounterId" = o.id AND r."clinicId" = ${c} AND ${where}
      ) r
      ORDER BY o."createdAt" DESC, o.id DESC LIMIT ${limit}`;
  const rows = await prisma.$queryRaw<GlanceRow[]>`
    WITH enc AS MATERIALIZED (
      SELECT e.id, e."createdAt" FROM "Encounter" e
      WHERE e."clinicId" = ${c} AND e."patientId" = ${p}
    ),
    g AS (${latest(
      'DiabetesScreening',
      Prisma.sql`${access.screening} AND r."glucoseMgDl" IS NOT NULL`,
      Prisma.sql`r."glucoseMgDl", r."glucoseType"::text AS type, r."collectedAt"`,
    )})
    SELECT
      ${gate(
        access.has('medical-history'),
        Prisma.sql`(SELECT json_agg(x) FROM (
          SELECT r.category, rev.details
          FROM "MedicalHistoryRecord" r
          JOIN "MedicalHistoryRevision" rev ON rev.id = r."currentRevisionId"
          WHERE r."clinicId" = ${c} AND r."patientId" = ${p}
            AND r.category IN ('CONDITION', 'FAMILY_HISTORY') AND rev.status = 'ACTIVE'
          -- shortcut: a chart with more active entries than this shows the newest 50.
          ORDER BY r."updatedAt" DESC, r.id DESC LIMIT 50) x)`,
      )} AS history,
      ${gate(
        access.screening,
        Prisma.sql`(SELECT x."hypertensionStatus" FROM (${latest(
          'HypertensionAssessment',
          Prisma.sql`r."hypertensionStatus" <> 'NOT_ASSESSED'`,
          Prisma.sql`r."hypertensionStatus"::text AS "hypertensionStatus"`,
        )}) x)`,
      )} AS hypertension_status,
      ${gate(
        access.screening,
        Prisma.sql`(SELECT json_build_object('status', x.status, 'type', x.type) FROM (${latest(
          'DiabetesScreening',
          Prisma.sql`r."diabetesStatus" <> 'NOT_ASSESSED'`,
          Prisma.sql`r."diabetesStatus" AS status, r."diabetesType" AS type`,
        )}) x)`,
      )} AS diabetes,
      ${gate(
        access.screening,
        Prisma.sql`(SELECT json_build_object('answer', x.answer, 'at', x."collectedAt" AT TIME ZONE 'UTC') FROM (${latest(
          'HypertensionAssessment',
          Prisma.sql`r."pregnantNow" <> 'NOT_ASSESSED'`,
          Prisma.sql`r."pregnantNow" AS answer, r."collectedAt"`,
        )}) x)`,
      )} AS pregnancy,
      ${gate(
        access.screening,
        Prisma.sql`(SELECT json_agg(json_build_object(
            'systolic', x."systolicBp", 'diastolic', x."diastolicBp",
            'repeatSystolic', rh."repeatSystolicBp", 'repeatDiastolic', rh."repeatDiastolicBp",
            'at', x."createdAt" AT TIME ZONE 'UTC') ORDER BY x.visit_at DESC, x.visit_id DESC)
          FROM (${latest(
            'Vitals',
            Prisma.sql`r."systolicBp" IS NOT NULL AND r."diastolicBp" IS NOT NULL`,
            Prisma.sql`r."systolicBp", r."diastolicBp", r."createdAt", r."encounterId"`,
            3,
          )}) x
          LEFT JOIN "HypertensionAssessment" rh ON rh."encounterId" = x."encounterId")`,
      )} AS bp,
      (SELECT json_build_object('mgDl', g."glucoseMgDl", 'type', g.type,
              'at', g."collectedAt" AT TIME ZONE 'UTC') FROM g) AS glucose_latest,
      -- An unknown type compares with nothing; fasting and random never mix.
      (SELECT json_agg(json_build_object('mgDl', d."glucoseMgDl", 'at', d."collectedAt" AT TIME ZONE 'UTC')
              ORDER BY d.visit_at DESC, d.visit_id DESC)
        FROM g, LATERAL (
          SELECT r."glucoseMgDl", r."collectedAt", o."createdAt" AS visit_at, o.id AS visit_id
          FROM enc o
          CROSS JOIN LATERAL (
            SELECT * FROM "DiabetesScreening" r
            WHERE r."encounterId" = o.id AND r."clinicId" = ${c}
              AND r."glucoseMgDl" IS NOT NULL AND r."glucoseType"::text = g.type
          ) r
          WHERE g.type <> 'UNKNOWN' AND (o."createdAt", o.id) < (g.visit_at, g.visit_id)
          ORDER BY o."createdAt" DESC, o.id DESC LIMIT 2
        ) d) AS glucose_previous,
      ${gate(
        access.screening,
        Prisma.sql`(SELECT json_build_object('percent', x."hba1cPercent", 'at', x."collectedAt" AT TIME ZONE 'UTC') FROM (${latest(
          'DiabetesScreening',
          Prisma.sql`r."hba1cPercent" IS NOT NULL`,
          Prisma.sql`r."hba1cPercent", r."collectedAt"`,
        )}) x)`,
      )} AS hba1c,
      ${gate(
        access.has('medications'),
        Prisma.sql`(SELECT json_build_object(
            'levels', (SELECT json_agg(m."takingAsPrescribed") FROM "EncounterMedicationAdherence" m
                       WHERE m."clinicId" = ${c} AND m."encounterId" = x."encounterId"),
            'at', x."createdAt" AT TIME ZONE 'UTC')
          FROM (${latest(
            'EncounterMedicationAdherence',
            Prisma.sql`r."takingAsPrescribed" <> 'NOT_ASSESSED'`,
            Prisma.sql`r."encounterId", r."createdAt"`,
          )}) x)`,
      )} AS adherence,
      ${gate(
        access.screening,
        Prisma.sql`(SELECT json_build_object('smoking', x."smokingStatus",
              'smokeless', x."smokelessTobaccoStatus", 'at', x."createdAt" AT TIME ZONE 'UTC')
          FROM (${latest(
            'TobaccoScreening',
            Prisma.sql`TRUE`,
            Prisma.sql`r."smokingStatus", r."smokelessTobaccoStatus", r."createdAt"`,
          )}) x)`,
      )} AS tobacco,
      ${gate(
        access.screening,
        Prisma.sql`(SELECT x."createdAt" AT TIME ZONE 'UTC' FROM (${latest(
          'EyeScreening',
          Prisma.sql`TRUE`,
          Prisma.sql`r."createdAt"`,
        )}) x)`,
      )} AS eye_at,
      ${gate(
        access.counselling,
        Prisma.sql`(SELECT x."createdAt" AT TIME ZONE 'UTC' FROM (${latest(
          'CounsellingRecord',
          Prisma.sql`TRUE`,
          Prisma.sql`r."createdAt"`,
        )}) x)`,
      )} AS counselling_at,
      ${gate(
        access.has('visits'),
        Prisma.sql`(SELECT x."followUpDate" AT TIME ZONE 'UTC' FROM (${latest(
          'CarePlan',
          Prisma.sql`r."followUpDate" IS NOT NULL`,
          Prisma.sql`r."followUpDate"`,
        )}) x)`,
      )} AS follow_up_at,
      (SELECT timezone FROM "Clinic" WHERE id = ${c}) AS timezone`;
  return rows[0];
}

const date = (at: At | Date | null | undefined) => (at ? new Date(at) : null);

/** The payload from one row and what `getSummary` already loaded. Pure. */
export function assembleGlance(
  row: GlanceRow,
  access: GlanceAccess,
  summary: Omit<PatientChartSummary, 'glance'>,
  now = new Date(),
): ChartGlance {
  const history = access.has('medical-history');
  const details = (category: string) =>
    (row.history ?? []).filter((entry) => entry.category === category).map((e) => e.details ?? {});
  const screeningConditions = access.screening
    ? {
        hypertension: row.hypertension_status,
        diabetes: row.diabetes?.status ?? null,
        diabetesType: row.diabetes?.type ?? null,
      }
    : null;

  const bp = (row.bp ?? []).map((reading) => {
    // The repeat is the careful measurement the interview asked for; it stands for the visit.
    const repeat = reading.repeatSystolic != null && reading.repeatDiastolic != null;
    return {
      systolic: repeat ? reading.repeatSystolic! : reading.systolic,
      diastolic: repeat ? reading.repeatDiastolic! : reading.diastolic,
      recordedAt: new Date(reading.at),
      repeat,
    };
  });
  const glucosePrevious = (row.glucose_previous ?? []).map((reading) => ({
    mgDl: reading.mgDl,
    recordedAt: new Date(reading.at),
  }));
  const adherenceLevel = row.adherence ? worstAdherence(row.adherence.levels ?? []) : null;
  const pregnantAt =
    row.pregnancy?.answer === 'YES' &&
    now.getTime() - new Date(row.pregnancy.at).getTime() <= PREGNANCY_CURRENT_DAYS * 86_400_000
      ? new Date(row.pregnancy.at)
      : null;

  const screenings: ChartGlance['screenings'] = [];
  const screened = (kind: ChartGlanceScreeningKind, lastAt: Date | null | undefined) =>
    screenings.push({ kind, lastAt: lastAt ?? null });
  if (summary.vitals) screened('VITALS', summary.vitals.latest?.recordedAt);
  if (summary.hypertension) screened('HYPERTENSION', summary.hypertension.latest?.collectedAt);
  if (summary.diabetes) screened('DIABETES', summary.diabetes.latest?.collectedAt);
  if (access.screening) screened('EYE', date(row.eye_at));
  if (access.counselling) screened('COUNSELLING', date(row.counselling_at));
  if (access.screening) screened('TOBACCO', date(row.tobacco?.at));

  const zone = row.timezone ?? CLINIC_DEFAULT_TIMEZONE;
  const visits = access.has('visits') ? summary.visits : null;

  return {
    generatedAt: now,
    conditions:
      history || screeningConditions
        ? {
            history: history
              ? dedupeConditions(
                  details('CONDITION')
                    .map((entry) => str(entry.conditionName))
                    .filter((name): name is string => name !== null),
                  {
                    hypertension: STATED_HYPERTENSION.includes(
                      screeningConditions?.hypertension ?? '',
                    ),
                    diabetes: STATED_DIABETES.includes(screeningConditions?.diabetes ?? ''),
                  },
                )
              : null,
            screening: screeningConditions,
          }
        : null,
    bloodPressure: access.screening
      ? {
          latest: bp[0] ?? null,
          previous: bp.slice(1),
          direction: trendDirection(
            bp[0]?.systolic,
            bp.slice(1).map((reading) => reading.systolic),
            BP_DEAD_BAND_MMHG,
          ),
        }
      : null,
    glucose: access.screening
      ? {
          latest: row.glucose_latest
            ? {
                mgDl: row.glucose_latest.mgDl,
                type: row.glucose_latest.type,
                recordedAt: new Date(row.glucose_latest.at),
              }
            : null,
          previous: glucosePrevious,
          direction: trendDirection(
            row.glucose_latest?.mgDl,
            glucosePrevious.map((reading) => reading.mgDl),
            GLUCOSE_DEAD_BAND_MG_DL,
          ),
          hba1c: row.hba1c
            ? { percent: row.hba1c.percent, recordedAt: new Date(row.hba1c.at) }
            : null,
        }
      : null,
    medications: summary.medications
      ? {
          ...summary.medications,
          adherence:
            row.adherence && adherenceLevel
              ? { level: adherenceLevel, recordedAt: new Date(row.adherence.at) }
              : null,
        }
      : null,
    risks:
      history || access.screening
        ? {
            allergies: history ? summary.allergies : null,
            familyHistory: history
              ? details('FAMILY_HISTORY').flatMap((entry) => {
                  const relationship = str(entry.relationship);
                  const condition = str(entry.familyCondition);
                  return relationship && condition ? [{ relationship, condition }] : [];
                })
              : null,
            screening: access.screening
              ? {
                  tobacco: row.tobacco
                    ? {
                        smoking: row.tobacco.smoking,
                        smokeless: row.tobacco.smokeless,
                        recordedAt: new Date(row.tobacco.at),
                      }
                    : null,
                  pregnantRecordedAt: pregnantAt,
                }
              : null,
          }
        : null,
    screenings,
    care: visits
      ? {
          visits: visits.total,
          lastVisitAt: visits.lastVisitAt,
          followUp: row.follow_up_at
            ? (() => {
                const dueOn = todayInTimeZone(zone, new Date(row.follow_up_at));
                const lastVisitOn = visits.lastVisitAt
                  ? todayInTimeZone(zone, visits.lastVisitAt)
                  : null;
                return {
                  dueOn,
                  state: followUpState(dueOn, todayInTimeZone(zone, now), lastVisitOn),
                };
              })()
            : null,
        }
      : null,
  };
}

/** Builds the "At a glance" block with one more query on top of the summary's. */
export async function buildChartGlance(
  prisma: PrismaService,
  clinicId: string,
  patientId: string,
  access: GlanceAccess,
  summary: Omit<PatientChartSummary, 'glance'>,
  now = new Date(),
): Promise<ChartGlance> {
  return assembleGlance(
    await loadGlanceRow(prisma, clinicId, patientId, access),
    access,
    summary,
    now,
  );
}
