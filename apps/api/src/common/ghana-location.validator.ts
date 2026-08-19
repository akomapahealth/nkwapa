import { isDistrictInRegion } from '@nkwapa/db';
import { GhanaRegion } from '@prisma/client';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

interface ResidentialLocationShape {
  residentialRegion?: GhanaRegion | null;
  residentialDistrict?: string | null;
}

/**
 * Cross-field constraint: a residential district is only valid when it belongs
 * to the sibling `residentialRegion`. An absent district is always valid (the
 * district is optional even when a region is recorded).
 */
@ValidatorConstraint({ name: 'isDistrictInRegion', async: false })
export class IsDistrictInRegionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (value == null || value === '') {
      return true;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const { residentialRegion } = args.object as ResidentialLocationShape;
    if (!residentialRegion) {
      return false;
    }
    return isDistrictInRegion(residentialRegion, value);
  }

  defaultMessage(args: ValidationArguments): string {
    const { residentialRegion } = args.object as ResidentialLocationShape;
    if (!residentialRegion) {
      return 'residentialDistrict requires a residentialRegion';
    }
    return 'residentialDistrict must be a district within the selected region';
  }
}

/** Validates that `residentialDistrict` belongs to `residentialRegion`. */
export function IsDistrictInRegion(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsDistrictInRegionConstraint,
    });
  };
}
