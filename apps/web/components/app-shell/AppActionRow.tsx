import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AppActionRowProps {
  title: string;
  detail?: string;
  icon: LucideIcon;
  /** Pass one real Button or Link. The caller retains permissions and behaviour. */
  action: ReactElement;
  tone?: 'neutral' | 'info' | 'warning' | 'destructive';
}

const tones = {
  neutral: 'text-muted-foreground',
  info: 'text-info-ink',
  warning: 'text-warning-ink',
  destructive: 'text-destructive-ink',
};

/** A ruled "Needs you now" item. Render inside a ul; data stays with the caller. */
export function AppActionRow({
  title,
  detail,
  icon: Icon,
  action,
  tone = 'neutral',
}: AppActionRowProps) {
  return (
    <li className="flex min-w-0 flex-col gap-3 border-b border-rule py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', tones[tone])} />
        <div className="min-w-0">
          <p className="type-label text-foreground">{title}</p>
          {detail ? (
            <p className="type-label mt-1 font-normal text-muted-foreground">{detail}</p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
