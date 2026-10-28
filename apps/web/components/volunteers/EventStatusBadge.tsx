import { Badge } from '@/components/ui/badge';
import type { ScreeningEvent } from '@/lib/volunteers';

export function EventStatusBadge({ status }: { status: ScreeningEvent['status'] }) {
  if (status === 'CANCELLED') return <Badge variant="warning">Cancelled</Badge>;
  if (status === 'COMPLETED') return <Badge variant="draft">Completed</Badge>;
  return <Badge variant="review">Scheduled</Badge>;
}
