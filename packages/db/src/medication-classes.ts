/**
 * Which catalogue categories belong to which chronic-disease interview.
 *
 * The hypertension and diabetes tabs each show "the medications the patient is on for this
 * condition", drawn from the reconciled patient medication list rather than a list of their own.
 * `Drug.category` is the only lever the catalogue gives us for that, so the mapping lives here
 * where the API query, the web picker and the note generator all read the same answer.
 *
 * KNOWN LIMITATION -- `DrugCategory` cannot fully answer this question.
 *
 * The enum mixes indication with pharmacologic class (`ANTIHYPERTENSIVE` and `ANTIDIABETIC` are
 * indications; `DIURETIC` and `BETA_BLOCKER` are classes), has no member for ACE inhibitors, ARBs
 * or calcium channel blockers, and defaults to `OTHER`. A real clinic catalogue will therefore
 * have most antihypertensives sitting in `OTHER`, invisible to any filter built on it. A
 * free-text medication row carries no `drugId` at all and so has no category whatsoever.
 *
 * The interview works around this by showing a second, explicitly-labelled group of the patient's
 * other current medications that the volunteer can pull into the section. Do not treat this
 * mapping as clinically complete; see issue #114 for the taxonomy conversation.
 */

export const CHRONIC_CONDITIONS = ['HYPERTENSION', 'DIABETES'] as const;

export type ChronicCondition = (typeof CHRONIC_CONDITIONS)[number];

/**
 * Blood-pressure medications.
 *
 * `DIURETIC` and `BETA_BLOCKER` are included because in this catalogue they exist precisely to
 * name antihypertensives more specifically. A thiazide prescribed for oedema would be a false
 * positive, which is the right way round: a medication shown that should not be is corrected by a
 * volunteer in a second, while one that is never shown is never noticed.
 */
export const HYPERTENSION_DRUG_CATEGORIES = [
  'ANTIHYPERTENSIVE',
  'DIURETIC',
  'BETA_BLOCKER',
] as const;

export const DIABETES_DRUG_CATEGORIES = ['ANTIDIABETIC'] as const;

export type ChronicDrugCategory =
  | (typeof HYPERTENSION_DRUG_CATEGORIES)[number]
  | (typeof DIABETES_DRUG_CATEGORIES)[number];

export function drugCategoriesForCondition(
  condition: ChronicCondition,
): readonly ChronicDrugCategory[] {
  return condition === 'HYPERTENSION' ? HYPERTENSION_DRUG_CATEGORIES : DIABETES_DRUG_CATEGORIES;
}

/**
 * Whether a category is claimed by a condition's section.
 *
 * A row that answers false here is not hidden -- it belongs in the "other current medications"
 * group -- so this decides grouping, never visibility.
 */
export function isCategoryForCondition(
  category: string | null | undefined,
  condition: ChronicCondition,
): boolean {
  if (!category) return false;
  return (drugCategoriesForCondition(condition) as readonly string[]).includes(category);
}
