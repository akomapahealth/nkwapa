import { StatusLabel } from '@/components/ui/status-label';
import { type ClinicalNoteStatus } from '@/lib/clinical-notes';

export function ClinicalNoteStatusBadge({ status }: { status: ClinicalNoteStatus }) {
  const variant =
    status === 'DRAFT'
      ? 'draft'
      : status === 'PENDING_COSIGN'
        ? 'review'
        : status === 'AMENDED'
          ? 'warning'
          : 'finalized';
  return <StatusLabel value={status} variant={variant} />;
}
