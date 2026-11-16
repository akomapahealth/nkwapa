'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  CloudOff,
  CopyCheck,
  FileText,
  HeartPulse,
  House,
  ListOrdered,
  Network,
  PartyPopper,
  Search,
  Shield,
  ShieldCheck,
  Stethoscope,
  UserCircle,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useReturnFocus } from '@/components/ui/use-return-focus';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { cn } from '@/lib/utils';
import {
  CURRENT_WELCOME_TOUR_VERSION,
  WELCOME_TOUR_OPEN_EVENT,
  shouldOfferWelcomeTour,
  welcomeTourSteps,
  type WelcomeTourIcon,
} from '@/lib/welcome-tour';
import { placeTourCard, type TourBox, type TourSide } from '@/lib/welcome-tour-placement';

const stepIcons: Record<Exclude<WelcomeTourIcon, 'welcome'>, LucideIcon> = {
  finish: PartyPopper,
  home: House,
  clinic: Building2,
  register: UserPlus,
  stations: ListOrdered,
  assigned: Stethoscope,
  queues: ClipboardList,
  patients: Search,
  notifications: Bell,
  offline: CloudOff,
  staff: UserCog,
  volunteers: Users,
  menu: UserCircle,
  metrics: BarChart3,
  report: FileText,
  audit: Shield,
  clinics: Network,
  duplicates: CopyCheck,
  'data-requests': ShieldCheck,
  health: HeartPulse,
  appointments: CalendarDays,
};

/** Spotlight from `md` up (tablets, laptops, desktops); phones keep the centred dialog. */
const SPOTLIGHT_QUERY = '(min-width: 768px)';
/** Room between the anchor and the ring. */
const SPOT_PAD = 6;
/** The house easing (`--ease-out`), on a step clock a little longer than a dialog's. */
const MOVE = { duration: 0.28, ease: [0.23, 1, 0.32, 1] } as const;
const STILL = { duration: 0 } as const;
/** The dim: a shadow wide enough to cover any screen from the cut-out outwards. */
const DIM = '0 0 0 200vmax hsl(197 30% 6% / 0.55)';

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(SPOTLIGHT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useSpotlightWidth() {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(SPOTLIGHT_QUERY).matches,
    () => false,
  );
}

/** The first element carrying this anchor that is actually on screen. */
function findAnchor(anchor: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(
    `[data-tour="${CSS.escape(anchor)}"]`,
  )) {
    const rect = element.getBoundingClientRect();
    const visible =
      element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true;
    if (rect.width > 0 && rect.height > 0 && visible) return element;
  }
  return null;
}

interface Spot {
  box: TourBox;
  radius: number;
}

/** The ring around an element: padded, rounded to match it, and kept inside the viewport. */
function measureSpot(element: HTMLElement): Spot | null {
  const rect = element.getBoundingClientRect();
  const x = Math.max(rect.left - SPOT_PAD, 4);
  const y = Math.max(rect.top - SPOT_PAD, 4);
  const width = Math.min(rect.right + SPOT_PAD, window.innerWidth - 4) - x;
  const height = Math.min(rect.bottom + SPOT_PAD, window.innerHeight - 4) - y;
  if (width <= 0 || height <= 0) return null;
  const radius = (parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0) + SPOT_PAD;
  return { box: { x, y, width, height }, radius: Math.min(radius, width / 2, height / 2) };
}

const sameSpot = (a: Spot | null, b: Spot | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.radius === b.radius &&
    a.box.x === b.box.x &&
    a.box.y === b.box.y &&
    a.box.width === b.box.width &&
    a.box.height === b.box.height);

/** The pointer: a rotated square on the card edge that faces the target. */
const POINTER_CLASS: Record<TourSide, string> = {
  right: '-left-[7px] border-b border-l',
  left: '-right-[7px] border-r border-t',
  bottom: '-top-[7px] border-l border-t',
  top: '-bottom-[7px] border-b border-r',
};

/*
  Once dismissed in this tab, never offered again in it, whatever the bootstrap says. The record
  on the server lags until the next whoami, and whoami runs again on every clinic switch -- without
  this, switching clinic straight after skipping would bring the tour back.
*/
let dismissedThisSession = false;

/**
 * The first-run welcome tour, offered once per person and different for each main role (#345).
 *
 * From `md` up it is a spotlight: the page dims, a ring cuts out the real control a step is about,
 * and the card sits beside it pointing at it. A step with no anchor, or whose anchor is not on
 * screen (a collapsed section, a page without it, a flag that is off), gets a centred card for
 * that step only. Phones keep the centred dialog with the same copy.
 *
 * Built on what is installed rather than a tour library: it stays a Radix modal dialog, so focus,
 * Escape, outside click and the inert page behind (InertBehindModal) behave like every other
 * dialog here, and framer-motion moves the ring. The ring shows a control; it never makes it
 * clickable.
 *
 * Skip and Finish both count as done. The close is optimistic -- the tour goes at once and the
 * server is told in the background. If that write fails the tour is simply offered again on a
 * later visit, which is a better failure than holding someone in a tour they asked to leave.
 *
 * Under reduced motion (read in JavaScript, through framer-motion) nothing travels: the ring and
 * card jump to the next step and the content cross-fades.
 */
export function WelcomeTour() {
  const bootstrapContext = useBootstrap();
  const bootstrap = bootstrapContext?.bootstrap ?? null;
  const getToken = useAuth();
  const reduceMotion = useReducedMotion();
  const focusReturn = useReturnFocus(undefined, undefined);
  const wide = useSpotlightWidth();

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const steps = useMemo(() => (bootstrap ? welcomeTourSteps(bootstrap) : []), [bootstrap]);

  useEffect(() => {
    if (dismissedThisSession || !shouldOfferWelcomeTour(bootstrap)) return;
    setIndex(0);
    setOpen(true);
  }, [bootstrap]);

  useEffect(() => {
    const openOnDemand = () => {
      setIndex(0);
      setDirection(1);
      setOpen(true);
    };
    window.addEventListener(WELCOME_TOUR_OPEN_EVENT, openOnDemand);
    return () => window.removeEventListener(WELCOME_TOUR_OPEN_EVENT, openOnDemand);
  }, []);

  const finish = useCallback(() => {
    dismissedThisSession = true;
    setOpen(false);
    void apiFetch('/auth/welcome-tour', {
      method: 'POST',
      getToken,
      skipClinicHeader: true,
      body: JSON.stringify({ version: CURRENT_WELCOME_TOUR_VERSION }),
    }).catch(() => {
      // Offered again next time. Nothing to tell the user: they asked to leave, and did.
    });
  }, [getToken]);

  const go = useCallback(
    (delta: 1 | -1) => {
      const next = index + delta;
      if (next < 0) return;
      if (next >= steps.length) {
        finish();
        return;
      }
      setDirection(delta);
      setIndex(next);
    },
    [finish, index, steps.length],
  );

  const step = steps.length > 0 ? steps[Math.min(index, steps.length - 1)] : undefined;
  const spotlight = open && wide;
  const anchor = spotlight ? step?.anchor : undefined;

  // Geometry in viewport pixels: measured before paint, then again on every resize, scroll and
  // layout change, so the ring never stays on empty space.
  const cardRef = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [card, setCard] = useState({ width: 360, height: 300 });
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  // Movement waits until the first measurement has painted, so the card never glides in from a guess.
  const [settled, setSettled] = useState(false);

  useLayoutEffect(() => {
    if (!spotlight) return;
    let frame = 0;
    let observed: HTMLElement | null = null;
    const observer = new ResizeObserver(() => schedule());

    function measure() {
      frame = 0;
      setViewport((current) =>
        current.width === window.innerWidth && current.height === window.innerHeight
          ? current
          : { width: window.innerWidth, height: window.innerHeight },
      );
      const node = cardRef.current;
      if (node) {
        setCard((current) =>
          current.width === node.offsetWidth && current.height === node.offsetHeight
            ? current
            : { width: node.offsetWidth, height: node.offsetHeight },
        );
      }
      // Looked up each time: a re-rendered sidebar replaces its links.
      const element = anchor ? findAnchor(anchor) : null;
      if (element !== observed) {
        if (observed) observer.unobserve(observed);
        if (element) observer.observe(element);
        observed = element;
      }
      const next = element ? measureSpot(element) : null;
      setSpot((current) => (sameSpot(current, next) ? current : next));
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    // Scroll the anchor in first, so the ring moves once, to where it will stay.
    const target = anchor ? findAnchor(anchor) : null;
    target?.scrollIntoView({
      block: target.getBoundingClientRect().height > window.innerHeight * 0.6 ? 'start' : 'nearest',
      inline: 'nearest',
    });
    measure();

    observer.observe(document.body);
    if (cardRef.current) observer.observe(cardRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    // A sidebar collapsing mid-tour moves the header's controls without resizing them.
    document.addEventListener('transitionend', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('transitionend', schedule, true);
    };
  }, [spotlight, anchor, index]);

  useEffect(() => {
    if (!spotlight) {
      setSettled(false);
      return;
    }
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [spotlight]);

  if (!step) return null;
  const isLast = index === steps.length - 1;
  const Icon = step.icon === 'welcome' ? null : stepIcons[step.icon];
  const offset = reduceMotion ? 0 : 24;
  const move = settled && !reduceMotion ? MOVE : STILL;
  const placement = placeTourCard(spot?.box ?? null, card, viewport);
  // With nothing to ring the cut-out shrinks to the centre, so the next ring grows out of it.
  const hole = spot
    ? { ...spot.box, borderRadius: spot.radius }
    : { x: viewport.width / 2, y: viewport.height / 2, width: 0, height: 0, borderRadius: 0 };

  const contentProps = {
    'aria-describedby': 'welcome-tour-body',
    ...focusReturn,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      }
    },
  };
  const gutter = wide ? 'px-5' : 'px-6 sm:px-7';

  const content = (
    <>
      <div className={cn('space-y-2.5 pt-5', gutter)}>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-eyebrow text-muted-foreground">Welcome tour</span>
          {/* Read out by the progress bar below; written here so nobody counts dots. */}
          <span aria-hidden="true" className="font-medium tabular-nums text-muted-foreground">
            Step {index + 1} of {steps.length}
          </span>
        </div>
        <div className="flex gap-1" role="img" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((item, barIndex) => (
            <span
              key={item.id}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-base ease-out-strong',
                barIndex <= index ? 'bg-primary' : 'bg-border',
              )}
            />
          ))}
        </div>
        {/* The title is announced on open; each later step is announced here, with its place. */}
        <p aria-live="polite" className="sr-only">
          {`Step ${index + 1} of ${steps.length}: ${step.title}`}
        </p>
      </div>

      <div
        className={cn(
          'relative min-h-0 overflow-y-auto pb-2',
          gutter,
          wide ? 'pt-4' : 'min-h-[240px] pt-6',
        )}
      >
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={step.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -offset }}
            transition={{ duration: 0.22, ease: MOVE.ease }}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary',
                  wide ? 'h-10 w-10' : 'h-12 w-12',
                )}
              >
                {Icon ? (
                  <Icon aria-hidden="true" className={wide ? 'h-5 w-5' : 'h-6 w-6'} />
                ) : (
                  <div className={cn('relative', wide ? 'h-6 w-6' : 'h-8 w-8')}>
                    <Image
                      src="/images/nkwapa-mark.png"
                      alt=""
                      fill
                      sizes="32px"
                      className="object-contain"
                    />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <DialogPrimitive.Title
                  className={cn(
                    'font-heading font-semibold tracking-tight text-foreground',
                    wide ? 'text-xl' : 'text-2xl',
                  )}
                >
                  {step.title}
                </DialogPrimitive.Title>
                <div id="welcome-tour-body">
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{step.body}</p>
                  <p className="mt-3 border-l-2 border-primary pl-3 text-sm leading-6 text-foreground">
                    <span className="font-semibold">Try this: </span>
                    {step.tryThis}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className={cn('flex items-center justify-between gap-2 border-t border-rule py-4', gutter)}
      >
        {isLast ? (
          <span />
        ) : (
          <Button type="button" variant="ghost" onClick={finish}>
            Skip
          </Button>
        )}
        <div className="flex items-center gap-2">
          {index > 0 ? (
            <Button type="button" variant="outline" onClick={() => go(-1)}>
              Back
            </Button>
          ) : null}
          <Button type="button" onClick={() => go(1)} autoFocus>
            {isLast ? 'Get started' : 'Next'}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape and an outside click both mean "not now", which is the same as Skip.
        if (!next) finish();
      }}
    >
      <DialogPrimitive.Portal>
        {/* z-[110]: above the header, sidebar and bottom bar (z-40), below toasts. */}
        <DialogPrimitive.Overlay
          className={cn(
            'anchored-overlay dialog-scrim fixed inset-0 z-[110] overflow-hidden',
            !wide && 'bg-foreground/30 backdrop-blur-[2px]',
          )}
        >
          {wide ? (
            /*
              The cut-out is one box; its shadow is the ring, a halo in the page colour that keeps
              the ring legible on any background, and the dim over everything else. The dim is a
              fixed ink, not a theme token, so the page dims in dark mode too.
            */
            <motion.div
              aria-hidden="true"
              data-welcome-tour-ring=""
              className="absolute left-0 top-0"
              style={{
                boxShadow: spot
                  ? `0 0 0 2px hsl(var(--ring)), 0 0 0 5px hsl(var(--background)), ${DIM}`
                  : DIM,
              }}
              initial={false}
              animate={hole}
              transition={move}
            />
          ) : null}
        </DialogPrimitive.Overlay>

        {wide ? (
          <motion.div
            className="fixed left-0 top-0 z-[111]"
            initial={false}
            animate={{ x: placement.x, y: placement.y }}
            transition={move}
          >
            <DialogPrimitive.Content
              ref={cardRef}
              {...contentProps}
              data-side={placement.side ?? 'none'}
              // The anchor this step rings, or "none" for a centred card; read by the e2e spec.
              data-spotlight={(spot && anchor) || 'none'}
              className="anchored-overlay relative flex max-h-[calc(100dvh-2rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xl outline-none"
            >
              {placement.side ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute h-3 w-3 rotate-45 border-border bg-card',
                    POINTER_CLASS[placement.side],
                  )}
                  style={
                    placement.side === 'left' || placement.side === 'right'
                      ? { top: placement.pointer - 6 }
                      : { left: placement.pointer - 6 }
                  }
                />
              ) : null}
              {content}
            </DialogPrimitive.Content>
          </motion.div>
        ) : (
          <DialogPrimitive.Content
            {...contentProps}
            // The house dialog's clock and centring (R7.3): keyboard opens are instant, a close
            // mid-entrance reverses, and reduced motion fades only.
            className="anchored-overlay fixed inset-0 z-[111] m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl outline-none"
          >
            {content}
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
