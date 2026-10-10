'use client';

import { buildComparisonRows, type DuplicateCandidatePatient } from '@/lib/patient-duplicates';

/**
 * Two patient charts, field by field.
 *
 * One table for the duplicate review queue and for the merge preview. They ask different
 * questions -- "are these the same person" and "what happens if I say they are" -- but they ask
 * it of the same eleven fields, and two implementations would eventually disagree about how to
 * show a missing date of birth in exactly the place an operator is deciding whether two records
 * describe one person.
 */
export function PatientComparisonTable({
  left,
  right,
  caption,
  leftLabel,
  rightLabel,
}: {
  left: DuplicateCandidatePatient;
  right: DuplicateCandidatePatient;
  caption: string;
  /** Overrides the column heading, where the chart's role matters more than its code. */
  leftLabel?: string;
  rightLabel?: string;
}) {
  const rows = buildComparisonRows(left, right);

  return (
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-medium text-foreground">
              Field
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-foreground">
              {leftLabel ? (
                <>
                  <span className="block text-eyebrow text-muted-foreground">{leftLabel}</span>
                  {left.patientCode}
                </>
              ) : (
                left.patientCode
              )}
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-foreground">
              {rightLabel ? (
                <>
                  <span className="block text-eyebrow text-muted-foreground">{rightLabel}</span>
                  {right.patientCode}
                </>
              ) : (
                right.patientCode
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border/70">
              <th scope="row" className="px-4 py-2.5 text-left font-normal text-muted-foreground">
                {row.label}
              </th>
              {/*
                "Same" is a word, not only a colour. A matching row is the signal an operator
                acts on, and colour alone would not reach a screen reader or survive a
                monochrome print.
              */}
              <td className="px-4 py-2.5 text-foreground">{row.valueA}</td>
              <td className="px-4 py-2.5 text-foreground">
                <span className={row.matches ? 'font-medium' : undefined}>{row.valueB}</span>
                {row.matches ? (
                  <span className="ml-2 text-xs uppercase tracking-wide text-success-ink">
                    Same
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
