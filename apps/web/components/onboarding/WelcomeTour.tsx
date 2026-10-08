'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Building2,
  CalendarDays,
  CircleHelp,
  CloudOff,
  HeartPulse,
  PanelLeft,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { cn } from '@/lib/utils';
import {
  CURRENT_WELCOME_TOUR_VERSION,
  WELCOME_TOUR_OPEN_EVENT,
  shouldOfferWelcomeTour,
  welcomeTourSteps,
  type WelcomeTourIcon,
} from '@/lib/welcome-tour';

const stepIcons: Record<Exclude<WelcomeTourIcon, 'welcome'>, LucideIcon> = {
  navigation: PanelLeft,
  clinic: Building2,
  start: Sunrise,
  offline: CloudOff,
  help: CircleHelp,
  health: HeartPulse,
  appointments: CalendarDays,
};

/*
  Once dismissed in this tab, never offered again in it, whatever the bootstrap says. The record
  on the server lags until the next whoami, and whoami runs again on every clinic switch -- without
  this, switching clinic straight after skipping would bring the tour back.
*/
let dismissedThisSession = false;

/**
 * The first-run welcome tour: a short dialog, Next / Back / Skip, offered once per person.
 *
 * Skip and Finish both count as done. The close is optimistic -- the dialog goes at once and the
 * server is told in the background. If that write fails the tour is simply offered again on a
 * later visit, which is a better failure than holding someone in a dialog they asked to leave.
 *
 * Motion is a short slide-and-fade between steps, direction-aware so Back reads as going back.
 * This is a once-in-a-lifetime screen, so it may take a little more motion than a clinical view;
 * under reduced motion the steps only cross-fade.
 */
export function WelcomeTour() {
  const bootstrapContext = useBootstrap();
  const bootstrap = bootstrapContext?.bootstrap ?? null;
  const getToken = useAuth();
  const reduceMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const steps = useMemo(
    () =>
      bootstrap
        ? welcomeTourSteps(bootstrap, { stationWorkflow: isWebFeatureEnabled('stationWorkflow') })
        : [],
    [bootstrap],
  );

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

  if (steps.length === 0) return null;
  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index === steps.length - 1;
  const Icon = step.icon === 'welcome' ? null : stepIcons[step.icon];
  const offset = reduceMotion ? 0 : 24;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // Escape and an outside click both mean "not now", which is the same as Skip.
        if (!next) finish();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[110] bg-foreground/30 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-150 data-[state=open]:duration-200" />
        <DialogPrimitive.Content
          aria-describedby="welcome-tour-body"
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              go(1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              go(-1);
            }
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-[111] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150',
          )}
        >
          <div className="relative min-h-[236px] px-6 pb-2 pt-7 sm:px-7">
            <AnimatePresence initial={false} mode="popLayout" custom={direction}>
              <motion.div
                key={step.id}
                custom={direction}
                initial={{ opacity: 0, x: direction * offset }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -offset }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {Icon ? (
                    <Icon aria-hidden="true" className="h-7 w-7" />
                  ) : (
                    <div className="relative h-10 w-10">
                      <Image
                        src="/images/nkwapa-mark.png"
                        alt=""
                        fill
                        sizes="40px"
                        className="object-contain"
                      />
                    </div>
                  )}
                </div>
                <DialogPrimitive.Title className="mt-5 font-heading text-2xl font-semibold tracking-tight text-foreground">
                  {step.title}
                </DialogPrimitive.Title>
                <p
                  id="welcome-tour-body"
                  className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base"
                >
                  {step.body}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between gap-3 px-6 pb-6 pt-4 sm:px-7">
            <div
              className="flex items-center gap-1.5"
              role="img"
              aria-label={`Step ${index + 1} of ${steps.length}`}
            >
              {steps.map((item, dotIndex) => (
                <span
                  key={item.id}
                  className={cn(
                    'h-1.5 rounded-full transition-[width,background-color] duration-base ease-out-strong',
                    dotIndex === index ? 'w-5 bg-primary' : 'w-1.5 bg-border',
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {isLast ? null : (
                <Button type="button" variant="ghost" onClick={finish}>
                  Skip
                </Button>
              )}
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
