import { Expose, Transform } from 'class-transformer';
import {
  Allow,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import {
  middleNameError,
  normalizeMiddleName,
  normalizeStaffNamePart,
  staffNameMessage,
  staffNamePartError,
} from '@nkwapa/db';

const NAME_LABELS: Record<string, string> = {
  firstName: 'First name',
  middleName: 'Middle name(s)',
  lastName: 'Last name',
};

export function staffNameLabel(property: string) {
  return NAME_LABELS[property] ?? 'Name';
}

/** Normalizes a name part; a blank one becomes undefined so `@IsOptional()` can skip it. */
export function ToStaffNamePart() {
  return Transform(({ value }) =>
    typeof value === 'string' ? normalizeStaffNamePart(value) || undefined : value,
  );
}

/** A first or last name under the shared rules (src/staff-name.ts in @nkwapa/db). */
export function IsStaffNamePart(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isStaffNamePart',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && staffNamePartError(value) === null,
        defaultMessage: (args?: ValidationArguments) =>
          staffNameMessage(
            (typeof args?.value === 'string' && staffNamePartError(args.value)) || 'REQUIRED',
            staffNameLabel(args?.property ?? propertyName),
          ),
      },
    });
  };
}

/**
 * Trimmed, spaces collapsed, blank -> null (#342). Reads the pre-#342 `middleInitial` key when
 * `middleName` is absent: an installed app may still replay queued changes that send it.
 * shortcut: the alias is for one release; remove it (and `MiddleInitialAlias`) in the next.
 */
export function ToMiddleName() {
  const expose = Expose();
  const transform = Transform(({ obj }) => {
    const value = obj?.middleName !== undefined ? obj.middleName : obj?.middleInitial;
    return typeof value === 'string' || value === null ? normalizeMiddleName(value) : value;
  });
  return (target: object, propertyName: string) => {
    expose(target, propertyName);
    transform(target, propertyName);
  };
}

/** The deprecated `middleInitial` key, accepted only so `ToMiddleName` can read it. */
export function MiddleInitialAlias() {
  return Allow();
}

/** Optional middle names under the first and last name's character rules. */
export function IsMiddleName(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isMiddleName',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          value === null || (typeof value === 'string' && middleNameError(value) === null),
        defaultMessage: (args?: ValidationArguments) =>
          staffNameMessage(
            (typeof args?.value === 'string' && middleNameError(args.value)) ||
              'INVALID_CHARACTERS',
            staffNameLabel('middleName'),
          ),
      },
    });
  };
}
