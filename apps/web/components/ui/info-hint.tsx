'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

const BUBBLE_WIDTH = 288;
const VIEWPORT_GUTTER = 12;

export function InfoHint({ label, className }: { label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    placement: 'top' | 'bottom';
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const bubbleId = useId();

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button || typeof window === 'undefined') {
      return;
    }

    const rect = button.getBoundingClientRect();
    const maxLeft = Math.max(window.innerWidth - BUBBLE_WIDTH - VIEWPORT_GUTTER, VIEWPORT_GUTTER);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - BUBBLE_WIDTH / 2, VIEWPORT_GUTTER),
      maxLeft,
    );
    const placement = window.innerHeight - rect.bottom > 160 ? 'bottom' : 'top';
    const top = placement === 'bottom' ? rect.bottom + 10 : rect.top - 10;

    setPosition({ left, top, placement });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || bubbleRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-label={`Show help: ${label}`}
        aria-describedby={open ? bubbleId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'touch-target inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=open]:bg-primary/10 data-[state=open]:text-primary',
          className,
        )}
        data-state={open ? 'open' : 'closed'}
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={bubbleRef}
              id={bubbleId}
              role="tooltip"
              className={cn(
                'fixed z-[120] w-72 rounded-2xl border border-border/80 bg-popover px-4 py-3 text-left text-sm leading-6 text-popover-foreground shadow-2xl shadow-black/15 outline-none animate-in fade-in-0 zoom-in-95',
                position.placement === 'top'
                  ? '-translate-y-full slide-in-from-bottom-1'
                  : 'slide-in-from-top-1',
              )}
              style={{ left: position.left, top: position.top }}
            >
              <span
                className={cn(
                  'absolute h-3 w-3 rotate-45 border border-border/80 bg-popover',
                  position.placement === 'top'
                    ? 'left-1/2 bottom-[-7px] -translate-x-1/2 border-l-0 border-t-0'
                    : 'left-1/2 top-[-7px] -translate-x-1/2 border-b-0 border-r-0',
                )}
                aria-hidden="true"
              />
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
