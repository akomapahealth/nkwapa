import {
  BP_DIASTOLIC_MAX,
  BP_DIASTOLIC_MIN,
  BP_SYSTOLIC_MAX,
  BP_SYSTOLIC_MIN,
  classifyBloodPressure,
  isHypotensive,
} from '@nkwapa/db';

type InputReading = number | string | null | undefined;

/** Presentation guard only. Staging and low-BP rules remain owned by the shared clinical module. */
export function bpReadingSignal(systolic: InputReading, diastolic: InputReading) {
  const number = (value: InputReading) =>
    value == null || (typeof value === 'string' && !value.trim()) ? NaN : Number(value);
  const sys = number(systolic);
  const dia = number(diastolic);
  if (
    !Number.isFinite(sys) ||
    !Number.isFinite(dia) ||
    sys < BP_SYSTOLIC_MIN ||
    sys > BP_SYSTOLIC_MAX ||
    dia < BP_DIASTOLIC_MIN ||
    dia > BP_DIASTOLIC_MAX ||
    sys <= dia
  )
    return null;
  return {
    systolic: sys,
    diastolic: dia,
    category: classifyBloodPressure(sys, dia),
    low: isHypotensive(sys, dia),
  };
}
