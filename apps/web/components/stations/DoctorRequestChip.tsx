'use client';

import { Stethoscope, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { doctorRequestLabel, type DoctorRequest } from '@/lib/doctor-requests';
import { cn } from '@/lib/utils';

/** "Doctor needed now", "Doctor requested" or "Dr Mensah on it" (#418). Words and an icon. */
export function DoctorRequestChip({
  request,
  me,
  className,
  ...props
}: {
  request: DoctorRequest | null | undefined;
  me?: string | null;
  className?: string;
  'aria-hidden'?: 'true';
}) {
  if (!request?.open) return null;
  const taken = Boolean(request.claimedBy);
  const Icon = taken ? UserCheck : Stethoscope;
  return (
    <Badge
      data-testid="doctor-request-chip"
      variant={taken ? 'secondary' : request.urgency === 'NOW' ? 'destructive' : 'warning'}
      className={cn('gap-1 whitespace-nowrap', className)}
      {...props}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {doctorRequestLabel(request, me)}
    </Badge>
  );
}
