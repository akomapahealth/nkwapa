import Image from 'next/image';
import { cn } from '@/lib/utils';

export const DESKTOP_ALT =
  "Nkwapa's station line on a laptop: what needs the manager now, such as two patients waiting over 20 minutes and two stations with no staff, then every waiting patient drawn as a bar by minutes waited at each station, with who is staffing it.";
export const DOCTOR_RECORD_ALT =
  "A patient's record as a doctor opens it: what still needs attention on the chart, the latest blood pressure of 148/94 mmHg from today's station, and sections for screening, allergies and medications.";
export const PHONE_ALT =
  "A volunteer's Stations screen on a phone: on duty at blood pressure, with the next patient in line, how long they have waited and a Take patient button.";

interface FrameProps {
  className?: string;
  sizes: string;
  /** Above the fold: load eagerly at high priority. */
  priority?: boolean;
  children?: React.ReactNode;
}

interface DesktopFrameProps extends FrameProps {
  /** Another 3840x2160 screenshot in place of the clinic dashboard. */
  src?: string;
  alt?: string;
}

// Every copy of a screenshot must opt in, not just the hero. Next's dev LCP check
// remembers one entry per image URL, and a later lazy copy overwrites the eager one.
const priorityProps = (priority?: boolean) =>
  priority ? ({ loading: 'eager', fetchPriority: 'high' } as const) : {};

/**
 * A real desktop screenshot in a plain browser frame. Children are overlaid on the image. The
 * screenshots are the light workspace, so the frame keeps the light canvas in both themes.
 */
export function DesktopFrame({
  className,
  sizes,
  priority,
  children,
  src = '/product/station-line-20261111.png',
  alt = DESKTOP_ALT,
}: DesktopFrameProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-foreground/15 bg-[hsl(180_23.8%_95.9%)] shadow-[0_40px_80px_-40px_hsl(192_29.4%_8%/0.55)]',
        className,
      )}
    >
      <div
        aria-hidden
        className="flex h-7 items-center gap-1.5 border-b border-[hsl(190.9_18%_88%)] px-3"
      >
        <span className="h-2 w-2 rounded-full bg-[hsl(190.9_18%_80%)]" />
        <span className="h-2 w-2 rounded-full bg-[hsl(190.9_18%_80%)]" />
        <span className="h-2 w-2 rounded-full bg-[hsl(190.9_18%_80%)]" />
      </div>
      <div className="relative">
        <Image
          src={src}
          alt={alt}
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

interface PhoneFrameProps extends Omit<FrameProps, 'children'> {
  /** Another phone screenshot in place of the volunteer's Stations screen, at 2x. */
  src?: string;
  alt?: string;
  height?: number;
}

/** A real phone screenshot (808px wide) in a restrained device frame. */
export function PhoneFrame({
  className,
  sizes,
  priority,
  src = '/product/stations-phone-20261112.png',
  alt = PHONE_ALT,
  height = 1744,
}: PhoneFrameProps) {
  return (
    <div
      className={cn(
        'rounded-[1.75rem] border border-foreground/15 bg-[hsl(195_23.1%_10.2%)] p-1.5 shadow-[0_30px_60px_-30px_hsl(192_29.4%_8%/0.6)]',
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={808}
        height={height}
        sizes={sizes}
        {...priorityProps(priority)}
        className="block h-auto w-full rounded-[1.35rem]"
      />
    </div>
  );
}
