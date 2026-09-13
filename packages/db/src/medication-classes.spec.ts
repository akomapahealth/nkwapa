import { DrugCategory } from '@prisma/client';
import {
  CHRONIC_CONDITIONS,
  DIABETES_DRUG_CATEGORIES,
  HYPERTENSION_DRUG_CATEGORIES,
  drugCategoriesForCondition,
  isCategoryForCondition,
} from './medication-classes';

describe('drugCategoriesForCondition', () => {
  it('maps each condition to its catalogue categories', () => {
    expect(drugCategoriesForCondition('HYPERTENSION')).toEqual(HYPERTENSION_DRUG_CATEGORIES);
    expect(drugCategoriesForCondition('DIABETES')).toEqual(DIABETES_DRUG_CATEGORIES);
  });

  /*
    Two conditions must never claim the same category.

    If they overlapped, one medication would appear in both interviews and collect two independent
    adherence observations for the same drug at the same visit.
  */
  it('claims no category for more than one condition', () => {
    const hypertension = new Set<string>(HYPERTENSION_DRUG_CATEGORIES);
    for (const category of DIABETES_DRUG_CATEGORIES) {
      expect(hypertension.has(category)).toBe(false);
    }
  });
});

describe('isCategoryForCondition', () => {
  it('groups a category into the condition that claims it', () => {
    expect(isCategoryForCondition('ANTIHYPERTENSIVE', 'HYPERTENSION')).toBe(true);
    expect(isCategoryForCondition('BETA_BLOCKER', 'HYPERTENSION')).toBe(true);
    expect(isCategoryForCondition('ANTIDIABETIC', 'DIABETES')).toBe(true);
    expect(isCategoryForCondition('ANTIDIABETIC', 'HYPERTENSION')).toBe(false);
  });

  /*
    A medication with no category is not claimed by any section.

    Free-text medication rows carry no drugId and therefore no category. They belong in the
    "other current medications" group, which is a grouping decision, never a hiding one.
  */
  it('claims nothing for a medication with no category', () => {
    expect(isCategoryForCondition(null, 'HYPERTENSION')).toBe(false);
    expect(isCategoryForCondition(undefined, 'DIABETES')).toBe(false);
    expect(isCategoryForCondition('', 'HYPERTENSION')).toBe(false);
  });

  it('claims nothing for OTHER', () => {
    expect(isCategoryForCondition(DrugCategory.OTHER, 'HYPERTENSION')).toBe(false);
    expect(isCategoryForCondition(DrugCategory.OTHER, 'DIABETES')).toBe(false);
  });
});

/*
  Every category the database can hold must have a grouping decision.

  This is the test that fails when someone adds ACE_INHIBITOR to DrugCategory without deciding
  which interview shows it -- which is the exact gap recorded in the module's header.
*/
describe('catalogue coverage', () => {
  it('accounts for every DrugCategory the schema declares', () => {
    const claimed = new Set<string>([...HYPERTENSION_DRUG_CATEGORIES, ...DIABETES_DRUG_CATEGORIES]);
    const unclaimed = Object.values(DrugCategory).filter((category) => !claimed.has(category));

    // OTHER is deliberately unclaimed: it is the catch-all the "other medications" group renders.
    expect(unclaimed).toEqual([DrugCategory.OTHER]);
  });

  it('names every category it claims as a real DrugCategory member', () => {
    const members = new Set<string>(Object.values(DrugCategory));
    for (const condition of CHRONIC_CONDITIONS) {
      for (const category of drugCategoriesForCondition(condition)) {
        expect(members.has(category)).toBe(true);
      }
    }
  });
});
