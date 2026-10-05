'use client';

import { DUPLICATE_MATCH_REASONS } from '@nkwapa/db';
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
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
 * The decision, strength, reason and search controls both duplicate screens filter by.
 *
 * `idPrefix` keeps label associations unique if two of these ever share a page, and `extraSummary`
 * lets a screen add a filter of its own -- the investigation's clinic pair -- to the same summary
 * line rather than describing it somewhere else.
 */
export function DuplicateFilterFields({
  idPrefix,
  filters,
  onChange,
  onReset,
  resetDisabled,
  extraSummary = [],
  emptyLabel,
}: {
  idPrefix: string;
  filters: DuplicateFilters;
  onChange: (next: DuplicateFilters) => void;
  onReset: () => void;
  resetDisabled?: boolean;
  extraSummary?: { label: string; value: string | null | undefined }[];
  emptyLabel: string;
}) {
  const update = (patch: Partial<DuplicateFilters>) => onChange({ ...filters, ...patch });

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-status`}>Decision</Label>
        <Select
          value={filters.status}
          onValueChange={(value) => update({ status: value as DuplicateStatusFilter })}
        >
          <SelectTrigger id={`${idPrefix}-status`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUPLICATE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-confidence`}>Match strength</Label>
        <Select
          value={filters.confidence}
          onValueChange={(value) => update({ confidence: value as DuplicateConfidenceFilter })}
        >
          <SelectTrigger id={`${idPrefix}-confidence`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONFIDENCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-reason`}>Why it matched</Label>
        <Select
          value={filters.reason}
          onValueChange={(value) => update({ reason: value as DuplicateReasonFilter })}
        >
          <SelectTrigger id={`${idPrefix}-reason`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any reason</SelectItem>
            {DUPLICATE_MATCH_REASONS.map((reason) => (
              <SelectItem key={reason} value={reason}>
                {DUPLICATE_MATCH_REASON_LABELS[reason]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-search`}>Name, chart code or clinic</Label>
        <Input
          id={`${idPrefix}-search`}
          value={filters.q}
          placeholder="Mensah, or NKP-2026-000001"
          onChange={(event) => update({ q: event.target.value })}
        />
      </div>

      <Button
        variant="outline"
        className="w-full"
        disabled={resetDisabled ?? duplicateFiltersAreDefault(filters)}
        onClick={onReset}
      >
        Reset filters
      </Button>

      <ActiveFilterSummary
        items={[
          {
            label: 'Decision',
            value: DUPLICATE_STATUS_OPTIONS.find((option) => option.value === filters.status)
              ?.label,
          },
          {
            label: 'Strength',
            value:
              filters.confidence === 'ALL' ? null : DUPLICATE_CONFIDENCE_LABELS[filters.confidence],
          },
          {
            label: 'Reason',
            value: filters.reason === 'ALL' ? null : DUPLICATE_MATCH_REASON_LABELS[filters.reason],
          },
          { label: 'Search', value: filters.q.trim() || null },
          ...extraSummary,
        ]}
        emptyLabel={emptyLabel}
      />
    </>
  );
}
