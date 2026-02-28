import { SetMetadata } from '@nestjs/common';

export const CLINIC_SCOPED_KEY = 'clinicScoped';
export const CLINIC_ID_SOURCE_KEY = 'clinicIdSource';

export type ClinicIdSource =
  | { type: 'param'; paramKey?: string }
  | { type: 'body'; bodyKey?: string }
  | { type: 'query'; queryKey?: string };

export function ClinicScoped(source?: ClinicIdSource) {
  if (!source) {
    return SetMetadata(CLINIC_SCOPED_KEY, true);
  }
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(CLINIC_SCOPED_KEY, true)(target, key!, descriptor as TypedPropertyDescriptor<unknown>);
    SetMetadata(CLINIC_ID_SOURCE_KEY, source)(target, key!, descriptor as TypedPropertyDescriptor<unknown>);
    return descriptor;
  };
}
