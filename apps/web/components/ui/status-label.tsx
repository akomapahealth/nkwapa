import { Badge, type BadgeProps } from '@/components/ui/badge';
import { statusLabel, statusVariant } from '@/lib/status-presentation';

export interface StatusLabelProps extends Omit<BadgeProps, 'children'> {
  value: string | null | undefined;
}

/** One labelled status, never colour alone. Callers can preserve a domain's tone. */
export function StatusLabel({ value, variant, ...props }: StatusLabelProps) {
  return (
    <Badge variant={variant ?? statusVariant(value)} {...props}>
      {statusLabel(value)}
    </Badge>
  );
}
