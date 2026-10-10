import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Static assertions about the diabetes migration SQL. Mirrors
 * `hypertension-migration.spec.ts`; the integration counterpart replays it against PostgreSQL.
 */
const sql = readFileSync(
  resolve(__dirname, '../prisma/migrations/20260913091000_expand_diabetes_screening/migration.sql'),
  'utf8',
);

describe('expand_diabetes_screening migration', () => {
  it('keeps the columns that predate the interview', () => {
    for (const column of [
      'glucoseMgDl',
      'glucoseType',
      'hba1cPercent',
      'symptoms',
      'symptomsJson',
    ]) {
      expect(sql).not.toMatch(new RegExp(`DROP COLUMN "${column}"`));
    }
    expect(sql).not.toMatch(/DROP TABLE "DiabetesScreening"/);
  });

  /*
    Plain ADD VALUE is safe because nothing here writes the new members.

    PostgreSQL forbids *using* a value added in the same transaction, not adding it. The backfill
    below references only FASTING and RANDOM, which already existed. If a future edit writes
    BEFORE_MEAL or POST_PRANDIAL_2H in this file, this fails and the rename-create-cast-drop dance
    becomes necessary.
  */
  it('extends the glucose and symptom vocabularies without writing the new members', () => {
    expect(sql).toMatch(/ALTER TYPE "GlucoseType" ADD VALUE 'BEFORE_MEAL'/);
    expect(sql).toMatch(/ALTER TYPE "GlucoseType" ADD VALUE 'POST_PRANDIAL_2H'/);
    expect(sql).toMatch(/ALTER TYPE "DiabetesSymptom" ADD VALUE 'HYPOGLYCEMIA_SYMPTOMS'/);
    expect(sql).toMatch(/ALTER TYPE "DiabetesSymptom" ADD VALUE 'FOOT_WOUND'/);
    expect(sql).toMatch(/ALTER TYPE "DiabetesSymptom" ADD VALUE 'NONE'/);

    const statements = sql.match(/(UPDATE|INSERT)[\s\S]*?;/g) ?? [];
    for (const statement of statements) {
      expect(statement).not.toMatch(/BEFORE_MEAL|POST_PRANDIAL_2H|HYPOGLYCEMIA_SYMPTOMS/);
    }
  });

  /*
    History should be honest from the first deploy, so existing rows get a suspicion result rather
    than NOT_ASSESSED -- but only where a rule actually applies.
  */
  it('backfills suspicion from the approved thresholds only', () => {
    expect(sql).toMatch(/"glucoseType" = 'FASTING' AND "glucoseMgDl" >= 126/);
    expect(sql).toMatch(/"glucoseType" = 'RANDOM' AND "glucoseMgDl" >= 200/);
  });

  it('leaves an unknown-context reading unclassified', () => {
    // The CASE has no branch naming UNKNOWN, so it falls through to the NOT_ASSESSED default.
    const backfill = /SET "derivedSuspicion" = CASE[\s\S]*?END;/.exec(sql)?.[0] ?? '';
    expect(backfill).toBeTruthy();
    expect(backfill).not.toMatch(/'UNKNOWN'/);
    expect(backfill).toMatch(/ELSE 'NOT_ASSESSED'/);
  });

  /*
    One-directional on purpose: a visit that recorded a blood pressure did check one, but a visit
    without one has not been asked, which is NOT_ASSESSED rather than NOT_COMPLETED.
  */
  it('answers the blood-pressure question from vitals without inventing a negative', () => {
    expect(sql).toMatch(/SET "bpCheckedToday" = 'COMPLETED'/);
    expect(sql).not.toMatch(/"bpCheckedToday" = 'NOT_COMPLETED'/);
  });

  it('constrains what the application also validates', () => {
    for (const constraint of [
      'DiabetesScreening_phq2_total_check',
      'DiabetesScreening_phq2_positive_check',
      'DiabetesScreening_home_glucose_check',
      'DiabetesScreening_year_diagnosed_check',
      'DiabetesScreening_jsonb_object_check',
      'DiabetesScreening_escalation_consistency_check',
    ]) {
      expect(sql).toContain(constraint);
    }
  });

  it('explains itself to whoever reads it next', () => {
    expect(sql.split('\n')[0]).toMatch(/^-- /);
    expect(sql.slice(0, 2000)).toMatch(/#114/);
  });
});
