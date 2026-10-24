import Image from 'next/image';
import { cn } from '@/lib/utils';

export const DESKTOP_ALT =
  "Nkwapa clinic dashboard on a laptop: the care delivery menu on the left, and today's patients, draft visits, visits waiting for review and measurement coverage for one clinic.";
export const PHONE_ALT =
  "The same Nkwapa clinic dashboard on a phone, with today's patients, visits and drafts stacked in one column.";

interface FrameProps {
  className?: string;
  sizes: string;
  /** Above the fold: load eagerly at high priority. */
  priority?: boolean;
  children?: React.ReactNode;
}

// Every copy of a screenshot must opt in, not just the hero. Next's dev LCP check
// remembers one entry per image URL, and a later lazy copy overwrites the eager one.
const priorityProps = (priority?: boolean) =>
  priority ? ({ loading: 'eager', fetchPriority: 'high' } as const) : {};

/** The real desktop screenshot in a plain browser frame. Children are overlaid on the image. */
export function DesktopFrame({ className, sizes, priority, children }: FrameProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-foreground/15 bg-[hsl(200_20%_9%)] shadow-[0_40px_80px_-40px_hsl(200_25%_8%/0.55)]',
        className,
      )}
    >
      <div aria-hidden className="flex h-7 items-center gap-1.5 border-b border-white/10 px-3">
        <span className="h-2 w-2 rounded-full bg-white/25" />
        <span className="h-2 w-2 rounded-full bg-white/25" />
        <span className="h-2 w-2 rounded-full bg-white/25" />
      </div>
      <div className="relative">
        <Image
          src="/desktop.png"
          alt={DESKTOP_ALT}
          width={3840}
          height={2160}
          sizes={sizes}
          {...priorityProps(priority)}
          className="block h-auto w-full"
        />
        {children}
      </div>
    </div>
  );
}

/** The real phone screenshot in a restrained device frame. */
export function PhoneFrame({ className, sizes, priority }: Omit<FrameProps, 'children'>) {
  return (
    <div
      className={cn(
        'rounded-[1.75rem] border border-foreground/15 bg-[hsl(200_20%_9%)] p-1.5 shadow-[0_30px_60px_-30px_hsl(200_25%_8%/0.6)]',
        className,
      )}
    >
      <Image
        src="/mobile.png"
        alt={PHONE_ALT}
        width={808}
        height={1744}
        sizes={sizes}
        {...priorityProps(priority)}
        className="block h-auto w-full rounded-[1.35rem]"
      />
    </div>
  );
}
