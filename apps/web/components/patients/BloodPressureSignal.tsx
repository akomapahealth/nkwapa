import { Check, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { bpReadingSignal } from '@/lib/bp-reading-signal';
import { HYPERTENSION_BADGE_VARIANTS, HYPERTENSION_LABELS } from '@/lib/hypertension';
import { cn } from '@/lib/utils';
import styles from './blood-pressure-signal.module.css';

const BANDS = ['NORMAL', 'ELEVATED', 'STAGE1', 'STAGE2', 'CRISIS'] as const;

/** Reading-level staging, never a diagnosis or a patient-level risk score. No save side effects. */
export function BloodPressureSignal({
  systolic,
  diastolic,
  compact = false,
  draft = false,
}: {
  systolic: number | string | null | undefined;
  diastolic: number | string | null | undefined;
  compact?: boolean;
  draft?: boolean;
}) {
  const signal = bpReadingSignal(systolic, diastolic);
  if (!signal)
    return compact ? null : (
      <p className="text-sm text-muted-foreground" data-testid="bp-category-unavailable">
        BP category appears when both values form a valid reading.
      </p>
    );
  const lowOnly = signal.low && ['NORMAL', 'ELEVATED'].includes(signal.category);
  const category = (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-live={compact ? undefined : 'polite'}
      aria-atomic="true"
    >
      {!lowOnly ? (
        <Badge variant={HYPERTENSION_BADGE_VARIANTS[signal.category]} data-testid="bp-category">
          {signal.category === 'CRISIS' ? (
            <TriangleAlert className="size-4" aria-hidden="true" />
          ) : null}
          BP: {HYPERTENSION_LABELS[signal.category]}
        </Badge>
      ) : null}
      {signal.low ? (
        <Badge variant="warning" data-testid={lowOnly ? 'bp-category' : undefined}>
          Low BP
        </Badge>
      ) : null}
    </div>
  );
  if (compact) return category;
  return (
    <section
      aria-label="Blood pressure category"
      className={styles.signal}
      data-category={signal.category}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {draft ? 'Unsaved BP reading' : 'Saved BP reading'}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {signal.systolic}/{signal.diastolic} <span className="text-sm font-normal">mmHg</span>
          </p>
        </div>
        {category}
      </div>
      <ol className={styles.bands} aria-label="Blood pressure categories">
        {BANDS.map((band) => (
          <li key={band} aria-current={!lowOnly && signal.category === band ? 'step' : undefined}>
            <span
              className={cn(
                'flex min-h-6 items-center gap-1 text-xs',
                signal.category === band
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {!lowOnly && signal.category === band ? (
                <Check className="size-3 shrink-0" aria-hidden="true" />
              ) : null}
              {HYPERTENSION_LABELS[band]}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        {signal.low ? 'Low BP is flagged separately from the hypertension band. ' : ''}
        Category of this reading, not overall patient risk.
      </p>
    </section>
  );
}
