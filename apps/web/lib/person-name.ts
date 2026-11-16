/**
 * Person names on screen (#342). The rules live in @nkwapa/db so the API and the web agree; this
 * adds the words both name forms use for the middle-names field, so they never drift apart.
 */
export {
  formatPersonName,
  normalizeMiddleName,
  type PersonNameParts,
  type PersonNameStyle,
} from '@nkwapa/db/person-name';

export const MIDDLE_NAME_LABEL = 'Middle name(s)';
export const MIDDLE_NAME_HINT = 'All other names, separated by spaces';
