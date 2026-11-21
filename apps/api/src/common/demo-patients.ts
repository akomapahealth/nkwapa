/**
 * Demo (training) charts are left out of every count, report and export (2026-11-21). Spread
 * into a Patient where, or nest under a relation: `{ patient: REAL_PATIENT }`.
 *
 * Operational queues (who is waiting, what needs review) keep demo patients, because volunteers
 * train by working them through the same line.
 */
export const REAL_PATIENT = { isDemo: false } as const;
