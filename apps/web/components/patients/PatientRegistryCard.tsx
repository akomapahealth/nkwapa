'use client';

import { useEffect, useRef, type ReactNode, type PointerEvent } from 'react';
import Link from 'next/link';
import { animate, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  return (
    <article
      className="relative overflow-hidden border-b border-border"
      aria-label={`${patient.firstName} ${patient.lastName}`}
    >
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
        className="relative touch-pan-y bg-card py-4"
        onPointerDown={(event) => {
          suppressClick.current = false;
          if (
            !enabled ||
            event.pointerType === 'mouse' ||
            !event.isPrimary ||
            (event.target as HTMLElement).closest('a, button, input, [role=button]')
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
        <h3 className="break-words font-body text-lg font-semibold text-foreground">
          {patient.firstName} {patient.lastName}
        </h3>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground" translate="no">
          {patient.patientCode}
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <div>
            <dt className="sr-only">Phone</dt>
            <dd className="break-all tabular-nums">{patient.phoneE164 || 'No phone on file'}</dd>
          </div>
          <div>
            <dt className="inline">ID last 4: </dt>
            <dd className="inline tabular-nums">
              {patient.nationalIdLast4 ? `…${patient.nationalIdLast4}` : '—'}
            </dd>
          </div>
        </dl>
        {children}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={href}>View record</Link>
          </Button>
          {canCheckIn ? (
            <Button loading={busy} disabled={disabled} onClick={onCheckIn}>
              Check in
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
