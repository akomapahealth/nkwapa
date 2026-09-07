import {
  COUNTRY_CODE_PATTERN,
  LOCATION_CODE_MAX_LENGTH,
  LOCATION_CODE_PATTERN,
  ZONE_CODE_MAX_LENGTH,
  isCountryCode,
  isLocationCode,
  isTimeZone,
  isZoneCode,
} from '@nkwapa/db';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Clinic metadata constraints.
 *
 * Every rule is delegated to `@nkwapa/db` so the API, the admin UI, the seed, and the repair
 * CLI cannot drift apart. Nothing here decides anything; these are only the class-validator
 * wrappers, in the same shape as `ghana-location.validator.ts`.
 */

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
export class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isTimeZone(value);
  }

  defaultMessage(): string {
    return 'timezone must be a named IANA time zone, such as Africa/Accra. A fixed UTC offset is not accepted because it carries no daylight-saving rules.';
  }
}

/** Validates that a value is a named IANA time zone the runtime can actually resolve. */
export function IsIanaTimeZone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsIanaTimeZoneConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isLocationCode', async: false })
export class IsLocationCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isLocationCode(value);
  }

  defaultMessage(): string {
    return `locationCode must be lowercase letters, digits and single hyphens, at most ${LOCATION_CODE_MAX_LENGTH} characters, and must not start or end with a hyphen (${LOCATION_CODE_PATTERN.source}).`;
  }
}

/** Validates a clinic's location code. Required: an empty value fails. */
export function IsLocationCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsLocationCodeConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isZoneCode', async: false })
export class IsZoneCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // A cleared zone code is how an operator removes one, and the column is nullable.
    if (value === null || value === undefined || value === '') return true;
    return typeof value === 'string' && isZoneCode(value);
  }

  defaultMessage(): string {
    return `zoneCode must be lowercase letters, digits and single hyphens, at most ${ZONE_CODE_MAX_LENGTH} characters. Leave it empty if this clinic has no zone yet.`;
  }
}

/** Validates a clinic's optional zone code. An absent or cleared value is valid. */
export function IsZoneCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsZoneCodeConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isCountryCode', async: false })
export class IsCountryCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isCountryCode(value);
  }

  defaultMessage(): string {
    return `countryCode must be a two-letter ISO-3166 alpha-2 code, such as GH (${COUNTRY_CODE_PATTERN.source}).`;
  }
}

/** Validates an ISO-3166 alpha-2 country code. Case is normalized before checking. */
export function IsCountryCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCountryCodeConstraint,
    });
  };
}
