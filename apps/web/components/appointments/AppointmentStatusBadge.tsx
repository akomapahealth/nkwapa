import { Badge } from '@/components/ui/badge';
import {
  getAppointmentRequestStatusView,
  getAppointmentStatusView,
} from '@/lib/appointment-status';
import { cn } from '@/lib/utils';

/**
 * The badge every appointment status is rendered through.
 *
 * The staff calendar and the portal each carried their own mapping and had already drifted. One
 * component means a status added to the API shows up the same way everywhere, and the description
 * behind it reaches assistive technology rather than only the colour.
 */

interface AppointmentStatusBadgeProps {
  status: string;
  className?: string;
  /** Announce the plain-language description alongside the label. */
  describe?: boolean;
}

export function AppointmentStatusBadge({
  status,
  className,
  describe = true,
}: AppointmentStatusBadgeProps) {
  const view = getAppointmentStatusView(status);
  return (
    <Badge variant={view.badgeVariant} className={cn('w-fit', className)}>
      {view.label}
      {describe ? <span className="sr-only"> {view.description}</span> : null}
    </Badge>
  );
}

export function AppointmentRequestStatusBadge({
  status,
  className,
  describe = true,
}: AppointmentStatusBadgeProps) {
  const view = getAppointmentRequestStatusView(status);
  return (
    <Badge variant={view.badgeVariant} className={cn('w-fit', className)}>
      {view.label}
      {describe ? <span className="sr-only"> {view.description}</span> : null}
    </Badge>
  );
}
