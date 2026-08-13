import { Badge } from '@/components/ui/badge';
import { clinicalNoteStatusLabel, type ClinicalNoteStatus } from '@/lib/clinical-notes';

export function ClinicalNoteStatusBadge({ status }: { status: ClinicalNoteStatus }) {
  const variant =
    status === 'DRAFT'
      ? 'draft'
      : status === 'PENDING_COSIGN'
        ? 'review'
        : status === 'AMENDED'
          ? 'warning'
          : 'finalized';
  return <Badge variant={variant}>{clinicalNoteStatusLabel(status)}</Badge>;
}
