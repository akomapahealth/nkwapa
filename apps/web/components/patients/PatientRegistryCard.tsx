'use client';

import { useEffect, useRef, type ReactNode, type PointerEvent } from 'react';
import Link from 'next/link';
import { animate, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SHEET_GUTTER } from '@/components/ui/data-table';
import { formatOpsDay } from '@/lib/ops';
import { cn } from '@/lib/utils';

/** A registry result, never a queue ticket. A swipe invokes the same check-in as the button. */
export function PatientRegistryCard({
  patient,
  href,
  canCheckIn,
  disabled,
  busy,
  onCheckIn,
  children,
}: {
  patient: {
    firstName: string;
    lastName: string;
    patientCode: string;
    phoneE164?: string | null;
    nationalIdLast4?: string | null;
    lastVisitAt?: string | null;
  };
  href: string;
  canCheckIn: boolean;
  disabled: boolean;
  busy: boolean;
  onCheckIn: () => void;
  children?: ReactNode;
}) {
  const front = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    distance: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const reduced = useReducedMotion();
  const enabled = canCheckIn && !disabled;

  const reset = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.moved) suppressClick.current = true;
    if (current && front.current?.hasPointerCapture(current.id))
      front.current.releasePointerCapture(current.id);
    animation.current?.stop();
    if (front.current) front.current.style.transform = '';
  };
  useEffect(() => {
    // Resizing, leaving the app, or a permission/busy change cannot complete a held swipe.
    window.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
    if (!enabled) reset();
    return () => {
      window.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [enabled]);

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const submit = !cancelled && enabled && current.moved && current.distance <= -84;
    reset();
    if (!reduced && current.moved && front.current) {
      const node = front.current;
      animation.current = animate(current.distance, 0, {
        type: 'spring',
        mass: 1,
        stiffness: ((2 * Math.PI) / 0.3) ** 2,
        damping: 2 * ((2 * Math.PI) / 0.3),
        onUpdate: (distance) => {
          node.style.transform = `translateX(${distance}px)`;
        },
        onComplete: () => {
          node.style.transform = '';
        },
      });
    }
    if (submit) onCheckIn();
  };

  const name = `${patient.firstName} ${patient.lastName}`.trim();
  return (
    <article className="relative overflow-hidden border-b border-border" aria-label={name}>
      {canCheckIn ? (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 flex w-28 flex-col items-center justify-center gap-2 bg-primary text-primary-foreground"
        >
          <Check className="h-5 w-5" />
          <span className="text-sm font-medium">Check in</span>
        </div>
      ) : null}
      <div
        ref={front}
        className={cn('relative flex touch-pan-y items-center gap-3 bg-card py-3', SHEET_GUTTER)}
        onPointerDown={(event) => {
          suppressClick.current = false;
          if (
            !enabled ||
            event.pointerType === 'mouse' ||
            !event.isPrimary ||
            // The name link is the row's own surface: a swipe may start on it, and the click that
            // would follow a swipe is swallowed below. Buttons keep their own press.
            (event.target as HTMLElement).closest('button, input, [role=button]')
          )
            return;
          animation.current?.stop();
          gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            distance: 0,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.id !== event.pointerId) return;
          const dx = Math.min(0, event.clientX - current.x);
          const dy = Math.abs(event.clientY - current.y);
          if (!current.moved) {
            if (dy > 8 && dy >= Math.abs(dx)) {
              reset();
              return;
            }
            if (Math.abs(dx) < 12 || Math.abs(dx) <= dy) return;
            current.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          current.distance = dx < -112 ? -112 + (dx + 112) * 0.25 : dx;
          event.currentTarget.style.transform = `translateX(${current.distance}px)`;
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => {
          // Native touch implicitly captures on the touched child. Its capture loss
          // bubbles when this row takes over; only losing the row's own capture cancels.
          if (event.target === event.currentTarget && gesture.current?.id === event.pointerId)
            reset();
        }}
        onClickCapture={(event) => {
          const suppressPointerClick = suppressClick.current && event.detail !== 0;
          suppressClick.current = false;
          // A cancelled gesture has no following click. Never swallow a later Enter/Space.
          if (suppressPointerClick) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className="min-w-0 flex-1">
          {/* The name opens the record (pilot `a.who`); a separate View button doubled the row. */}
          <h2 className="break-words font-body text-base font-semibold leading-6 text-foreground">
            <Link
              href={href}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {name}
            </Link>
          </h2>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <span className="break-all font-mono text-xs leading-5" translate="no">
              {patient.patientCode}
            </span>
            {/* Pilot: code and last visit. The masked phone stays on the wide table only. */}
            {patient.lastVisitAt ? (
              <span className="tabular-nums">
                <span className="sr-only">Last visit </span>
                <time dateTime={patient.lastVisitAt}>{formatOpsDay(patient.lastVisitAt)}</time>
              </span>
            ) : (
              <span>No visits yet</span>
            )}
            {patient.nationalIdLast4 ? (
              <span className="tabular-nums">
                <span className="sr-only">ID last 4 </span>
                <span aria-hidden="true">ID </span>…{patient.nationalIdLast4}
              </span>
            ) : null}
          </p>
          {children}
        </div>
        {canCheckIn ? (
          <Button
            variant="primaryOutline"
            className="shrink-0"
            loading={busy}
            disabled={disabled}
            onClick={onCheckIn}
          >
            Check in
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** Name over code, the pilot's patient cell. Shared with the queues so a patient reads the same. */
export function PatientIdentity({
  name,
  code,
  idLast4,
}: {
  name: string;
  code: string;
  /** The registry's search key; shown after the code so identity checks need no extra column. */
  idLast4?: string | null;
}) {
  return (
    <span className="block min-w-0">
      <span className="block break-words font-semibold text-foreground">{name}</span>
      <span className="block text-xs text-muted-foreground">
        <span className="font-mono" translate="no">
          {code}
        </span>
        {idLast4 ? (
          <span className="tabular-nums">
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, ID last 4 </span>
            <span aria-hidden="true">ID </span>…{idLast4}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** First four and last four digits only, as the registry has always shown a number. */
export function maskPhone(value: string) {
  return value.replace(/(.{4}).*(.{4})/, '$1 ••• $2');
}
