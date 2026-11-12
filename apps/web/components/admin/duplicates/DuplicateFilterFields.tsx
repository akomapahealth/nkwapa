'use client';

import { DUPLICATE_MATCH_REASONS } from '@nkwapa/db/patient-duplicates';
import {
  DUPLICATE_CONFIDENCE_LABELS,
  DUPLICATE_MATCH_REASON_LABELS,
  DUPLICATE_REVIEW_STATUS_LABELS,
  duplicateFiltersAreDefault,
  type DuplicateConfidenceFilter,
  type DuplicateFilters,
  type DuplicateReasonFilter,
  type DuplicateStatusFilter,
} from '@/lib/patient-duplicates';
import { ListSearch, TOOLBAR_SELECT } from '@/components/app-shell/ListToolbar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const DUPLICATE_STATUS_OPTIONS: { value: DuplicateStatusFilter; label: string }[] = [
  { value: 'OPEN', label: DUPLICATE_REVIEW_STATUS_LABELS.OPEN },
  { value: 'CONFIRMED', label: DUPLICATE_REVIEW_STATUS_LABELS.CONFIRMED },
  { value: 'DISMISSED', label: DUPLICATE_REVIEW_STATUS_LABELS.DISMISSED },
  { value: 'ALL', label: 'Every candidate' },
];

const CONFIDENCE_OPTIONS: { value: DuplicateConfidenceFilter; label: string }[] = [
  { value: 'ALL', label: 'Any strength' },
  { value: 'HIGH', label: DUPLICATE_CONFIDENCE_LABELS.HIGH },
  { value: 'MEDIUM', label: DUPLICATE_CONFIDENCE_LABELS.MEDIUM },
  { value: 'LOW', label: DUPLICATE_CONFIDENCE_LABELS.LOW },
];

/**
 * The search, decision, strength and reason controls both duplicate screens filter by, as a list
 * toolbar (MASTER "Lists (W3)"): the search leads, the three selects sit in one row with quiet
 * labels and show their own value, so no summary line repeats them.
 *
 * `idPrefix` keeps label associations unique if two of these ever share a page.
 */
export function DuplicateFilterFields({
  idPrefix,
  filters,
  onChange,
  onReset,
  resetDisabled,
}: {
  idPrefix: string;
  filters: DuplicateFilters;
  onChange: (next: DuplicateFilters) => void;
  onReset: () => void;
  resetDisabled?: boolean;
}) {
  const update = (patch: Partial<DuplicateFilters>) => onChange({ ...filters, ...patch });
  const selects = [
    {
      key: 'status',
      label: 'Decision',
      value: filters.status,
      onChange: (value: string) => update({ status: value as DuplicateStatusFilter }),
      options: DUPLICATE_STATUS_OPTIONS,
    },
    {
      key: 'confidence',
      label: 'Match strength',
      value: filters.confidence,
      onChange: (value: string) => update({ confidence: value as DuplicateConfidenceFilter }),
      options: CONFIDENCE_OPTIONS,
    },
    {
      key: 'reason',
      label: 'Why it matched',
      value: filters.reason,
      onChange: (value: string) => update({ reason: value as DuplicateReasonFilter }),
      options: [
        { value: 'ALL', label: 'Any reason' },
        ...DUPLICATE_MATCH_REASONS.map((reason) => ({
          value: reason,
          label: DUPLICATE_MATCH_REASON_LABELS[reason],
        })),
      ],
    },
  ];

  return (
    <div className="space-y-3">
      <ListSearch
        id={`${idPrefix}-search`}
        label="Name, chart code or clinic"
        value={filters.q}
        placeholder="Name, chart code or clinic…"
        onChange={(q) => update({ q })}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {selects.map((select) => (
          <div key={select.key} className="flex items-center gap-2">
            <Label
              htmlFor={`${idPrefix}-${select.key}`}
              className="text-sm font-normal text-muted-foreground"
            >
              {select.label}
            </Label>
            <Select value={select.value} onValueChange={select.onChange}>
              <SelectTrigger id={`${idPrefix}-${select.key}`} className={TOOLBAR_SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {select.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {(resetDisabled ?? duplicateFiltersAreDefault(filters)) ? null : (
          <Button variant="link" size="sm" onClick={onReset}>
            Reset filters
          </Button>
        )}
      </div>
    </div>
  );
}
