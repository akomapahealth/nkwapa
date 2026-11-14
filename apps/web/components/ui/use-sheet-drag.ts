'use client';

import * as React from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Only the handle owns gestures. Scrollable bodies and clinical controls never do. */
export function useSheetDrag(side: Side) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const handleRef = React.useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const horizontal = side === 'left' || side === 'right';
  const sign = side === 'left' || side === 'top' ? -1 : 1;
  const position = React.useRef(0);
  const animation = React.useRef<ReturnType<typeof animate> | null>(null);
  const gesture = React.useRef<{
    id: number;
    start: number;
    crossStart: number;
    origin: number;
    last: number;
    time: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = React.useRef(false);

  const paint = React.useCallback(
    (distance: number) => {
      position.current = distance;
      if (node)
        node.style.translate = horizontal ? `${distance * sign}px 0` : `0 ${distance * sign}px`;
    },
    [horizontal, node, sign],
  );

  const releaseCapture = React.useCallback(() => {
    const id = gesture.current?.id;
    if (gesture.current?.moved) suppressClick.current = true;
    gesture.current = null;
    node?.removeAttribute('data-dragging');
    if (id !== undefined && handleRef.current?.hasPointerCapture(id)) {
      handleRef.current.releasePointerCapture(id);
    }
  }, [node]);

  const settle = React.useCallback(
    (velocity = 0) => {
      animation.current?.stop();
      if (reduced) {
        paint(0);
        return;
      }
      animation.current = animate(position.current, 0, {
        type: 'spring',
        // Apple's sheet response 0.3s / damping ratio 0.8, expressed as physics.
        // Motion's duration/bounce springs discard release velocity.
        mass: 1,
        stiffness: ((2 * Math.PI) / 0.3) ** 2,
        damping: 2 * 0.8 * ((2 * Math.PI) / 0.3),
        velocity: velocity * 1000,
        onUpdate: paint,
        onComplete: () => paint(0),
      });
    },
    [paint, reduced],
  );

  React.useEffect(() => {
    if (!node) return;
    const reset = () => {
      animation.current?.stop();
      releaseCapture();
      paint(0);
    };
    const navigate = () => {
      reset();
      if (node.dataset.state === 'open') closeRef.current?.click();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    // A controlled close (Escape, explicit button, route action) interrupts a held gesture.
    const observer = new MutationObserver(() => {
      if (node.dataset.state === 'closed') {
        animation.current?.stop();
        releaseCapture();
      } else reset();
    });
    observer.observe(node, { attributes: true, attributeFilter: ['data-state'] });
    window.addEventListener('resize', reset);
    window.visualViewport?.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('popstate', navigate);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      animation.current?.stop();
      releaseCapture();
      window.removeEventListener('resize', reset);
      window.visualViewport?.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('popstate', navigate);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [node, paint, releaseCapture]);

  const previousPath = React.useRef(pathname);
  React.useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      animation.current?.stop();
      releaseCapture();
      closeRef.current?.click();
    }
  }, [pathname, releaseCapture]);

  React.useEffect(() => {
    if (reduced) {
      animation.current?.stop();
      releaseCapture();
      paint(0);
    }
  }, [reduced, paint, releaseCapture]);

  const finish = (event: React.PointerEvent, cancelled: boolean) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    suppressClick.current = active.moved;
    const velocity = event.timeStamp - active.time < 100 ? active.velocity : 0;
    const size = horizontal ? node!.offsetWidth : node!.offsetHeight;
    // Reversing towards the workspace always restores it, even after a long pull.
    const dismiss =
      !cancelled &&
      velocity >= 0 &&
      position.current > 0 &&
      (position.current >= Math.min(160, size * 0.3) || (position.current > 24 && velocity > 0.5));
    releaseCapture();
    if (dismiss) {
      animation.current?.stop();
      closeRef.current?.click();
    } else settle(cancelled ? 0 : velocity);
  };

  return {
    setNode,
    closeRef,
    handleProps: {
      ref: handleRef,
      onClick: (event: React.MouseEvent) => {
        if (event.detail !== 0 && suppressClick.current) {
          event.preventDefault();
          suppressClick.current = false;
          return;
        }
        closeRef.current?.click();
      },
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (
          !event.isPrimary ||
          event.button !== 0 ||
          gesture.current ||
          node?.dataset.state !== 'open'
        )
          return;
        suppressClick.current = false;
        animation.current?.stop();
        // Freeze an interrupted entrance at its presentation value before taking ownership.
        const transform = getComputedStyle(node).transform;
        if (transform !== 'none') {
          const matrix = new DOMMatrixReadOnly(transform);
          paint(position.current + (horizontal ? matrix.m41 : matrix.m42) * sign);
        }
        node.getAnimations().forEach((entry) => entry.cancel());
        node.dataset.dragging = 'true';
        event.currentTarget.setPointerCapture(event.pointerId);
        const coordinate = horizontal ? event.clientX : event.clientY;
        gesture.current = {
          id: event.pointerId,
          start: coordinate,
          crossStart: horizontal ? event.clientY : event.clientX,
          origin: position.current,
          last: coordinate,
          time: event.timeStamp,
          velocity: 0,
          moved: false,
        };
      },
      onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
        const active = gesture.current;
        if (!active || event.pointerId !== active.id) return;
        const coordinate = horizontal ? event.clientX : event.clientY;
        const delta = (coordinate - active.start) * sign;
        const crossDelta = (horizontal ? event.clientY : event.clientX) - active.crossStart;
        active.moved ||= Math.hypot(delta, crossDelta) > 6;
        const elapsed = event.timeStamp - active.time;
        if (elapsed > 0) active.velocity = ((coordinate - active.last) * sign) / elapsed;
        active.last = coordinate;
        active.time = event.timeStamp;
        const distance = active.origin + delta;
        // Increasing resistance towards the attached edge; outward motion tracks 1:1.
        paint(distance < 0 ? distance / (1 + Math.abs(distance) / 32) : distance);
      },
      onPointerUp: (event: React.PointerEvent) => finish(event, false),
      onPointerCancel: (event: React.PointerEvent) => finish(event, true),
      onLostPointerCapture: (event: React.PointerEvent) => finish(event, true),
    },
  };
}
