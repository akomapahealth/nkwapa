import { HYPERTENSION_BADGE_VARIANTS, HYPERTENSION_LABELS } from '@/lib/hypertension';

// Presentation only. Keep enum values unchanged in requests, saved data, guards,
// sorting and filters; translate them only where a person reads them.
const LABELS: Readonly<Record<string, string>> = {
  ...HYPERTENSION_LABELS,
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  FINALIZED: 'Finalized',
  PENDING_COSIGN: 'Pending cosign',
  COSIGNED: 'Cosigned',
  AMENDED: 'Amended',
  CURRENT: 'Current',
  HISTORICAL: 'Historical',
  LOCKED: 'Locked',
  UNKNOWN: 'Unknown',
};

export function statusLabel(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  if (Object.hasOwn(LABELS, value)) return LABELS[value];
  // Preserve already-written copy (for example "HAP note by …"). New system
  // enum values remain readable without silently dropping their information.
  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) return value;
  const words = value.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type StatusVariant = 'draft' | 'review' | 'finalized' | 'warning' | 'severe' | 'destructive';

export function statusVariant(value: string | null | undefined): StatusVariant {
  if (['FINALIZED', 'COSIGNED', 'SENT', 'DELIVERED', 'COMPLETED'].includes(value ?? ''))
    return 'finalized';
  if (['IN_REVIEW', 'PENDING_COSIGN', 'IN_PROGRESS', 'QUEUED'].includes(value ?? ''))
    return 'review';
  if (value && Object.hasOwn(HYPERTENSION_BADGE_VARIANTS, value))
    return HYPERTENSION_BADGE_VARIANTS[value as keyof typeof HYPERTENSION_BADGE_VARIANTS];
  if (value === 'FAILED') return 'destructive';
  if (['AMENDED', 'HELD', 'UNSYNCED', 'RETRYING'].includes(value ?? '')) return 'warning';
  return 'draft';
}
