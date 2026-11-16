'use client';

import {
  checkDangerSigns,
  FOLLOW_UP_REASON_LABELS,
  type FollowUpInput,
} from '@nkwapa/db/follow-up-stratification';
import { HYPERTENSION_SYMPTOM_LABELS } from '@nkwapa/db/hypertension-interview';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { isWebFeatureEnabled } from '@/lib/feature-flags';

/**
 * Check 1 of the follow-up engine, live as values are typed (#336). It runs on the device from
 * what is on the form, so it works offline and before anything is saved; the server repeats the
 * check on save and owns the tier. Shown to everyone who fills the form: a danger sign is not a
 * clinician-only fact.
 *
 * Enters with a short fade (it is rare and must be noticed); reduced motion keeps only the
 * colour. Never a toast: it stays while the danger stays.
 */
export function DangerSignNotice({
  input,
  className,
}: {
  input: Omit<FollowUpInput, 'today'>;
  className?: string;
}) {
  if (!isWebFeatureEnabled('followUpStratification')) return null;
  const { reasons, askAboutSymptoms } = checkDangerSigns({ ...input, today: new Date() });
  const motion =
    'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 duration-200 ease-out';

  if (reasons.length > 0) {
    return (
      <InlineNotice tone="error" className={`${motion} ${className ?? ''}`}>
        <span data-testid="danger-sign-refer" className="block font-semibold">
          Refer today. Do not send the patient home.
        </span>
        <span className="block">
          {reasons.map((reason) => FOLLOW_UP_REASON_LABELS[reason]).join(' · ')}
        </span>
      </InlineNotice>
    );
  }
  if (askAboutSymptoms.length > 0) {
    return (
      <InlineNotice tone="warning" className={`${motion} ${className ?? ''}`}>
        <span data-testid="danger-sign-repeat" className="block font-semibold">
          Very high reading. Repeat it now and ask about these symptoms.
        </span>
        <span className="block">
          {askAboutSymptoms.map((symptom) => HYPERTENSION_SYMPTOM_LABELS[symptom]).join(' · ')}
        </span>
      </InlineNotice>
    );
  }
  return null;
}

/** A reading typed on a form now, or none while either number is missing or not a number. */
export function readingNow(
  systolic: string | number | null | undefined,
  diastolic: string | number | null | undefined,
): FollowUpInput['readings'] {
  const s = Number(systolic);
  const d = Number(diastolic);
  if (systolic === '' || diastolic === '' || systolic == null || diastolic == null) return [];
  if (!Number.isFinite(s) || !Number.isFinite(d)) return [];
  return [{ systolic: s, diastolic: d, at: new Date(), measured: true }];
}
