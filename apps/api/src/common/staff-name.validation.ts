import { Transform } from 'class-transformer';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import {
  MIDDLE_INITIAL_MESSAGE,
  middleInitialError,
  normalizeMiddleInitial,
  normalizeStaffNamePart,
  staffNameMessage,
  staffNamePartError,
} from '@nkwapa/db';

const NAME_LABELS: Record<string, string> = { firstName: 'First name', lastName: 'Last name' };

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

/** "k." -> "K"; blank -> null. */
export function ToMiddleInitial() {
  return Transform(({ value }) =>
    typeof value === 'string' || value == null ? normalizeMiddleInitial(value) : value,
  );
}

export function IsMiddleInitial(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isMiddleInitial',
      target: object.constructor,
      propertyName,
      options: { message: MIDDLE_INITIAL_MESSAGE, ...validationOptions },
      validator: {
        validate: (value: unknown) =>
          value === null || (typeof value === 'string' && middleInitialError(value) === null),
      },
    });
  };
}
