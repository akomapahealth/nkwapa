/**
 * Where the welcome tour's card sits beside the spotlit element (#345). Pure, so it is tested
 * without a browser: viewport coordinates in, the card's top-left corner and pointer out.
 */

export interface TourBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TourSide = 'top' | 'right' | 'bottom' | 'left';

export interface TourCardPlacement {
  /** The side of the target the card is on. Null when centred or laid over the target. */
  side: TourSide | null;
  x: number;
  y: number;
  /** The pointer's distance along the card edge facing the target, in px. */
  pointer: number;
}

/** Space between the cut-out and the card, and between the card and the viewport edge. */
export const TOUR_GAP = 14;
export const TOUR_MARGIN = 16;
/** How close the pointer may come to a card corner. */
const POINTER_INSET = 20;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Preferred first on a tie. */
const SIDES: TourSide[] = ['right', 'bottom', 'left', 'top'];
const OPPOSITE: Record<TourSide, TourSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

export function placeTourCard(
  target: TourBox | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): TourCardPlacement {
  const { width: w, height: h } = card;
  const { width: vw, height: vh } = viewport;
  const maxX = vw - w - TOUR_MARGIN;
  const maxY = vh - h - TOUR_MARGIN;

  if (!target) {
    return {
      side: null,
      x: clamp((vw - w) / 2, TOUR_MARGIN, maxX),
      y: clamp((vh - h) / 2, TOUR_MARGIN, maxY),
      pointer: 0,
    };
  }

  const right = target.x + target.width;
  const bottom = target.y + target.height;
  const room: Record<TourSide, number> = {
    top: target.y - TOUR_GAP - TOUR_MARGIN - h,
    bottom: vh - bottom - TOUR_GAP - TOUR_MARGIN - h,
    left: target.x - TOUR_GAP - TOUR_MARGIN - w,
    right: vw - right - TOUR_GAP - TOUR_MARGIN - w,
  };
  // Away from the screen edge the target hugs (right of a sidebar link, below a header control),
  // else whichever side has the most room.
  const edgeDistance: Record<TourSide, number> = {
    left: target.x,
    top: target.y,
    right: vw - right,
    bottom: vh - bottom,
  };
  const nearestEdge = SIDES.reduce((a, b) => (edgeDistance[b] < edgeDistance[a] ? b : a));
  const away = OPPOSITE[nearestEdge];
  const side =
    room[away] >= 0
      ? away
      : SIDES.reduce<TourSide | null>(
          (best, candidate) =>
            room[candidate] >= 0 && (best === null || room[candidate] > room[best])
              ? candidate
              : best,
          null,
        );

  const centreX = target.x + target.width / 2;
  const centreY = target.y + target.height / 2;

  if (side === null) {
    // Nothing fits beside it (a work area filling the screen): lay the card over its lower right,
    // inside the ring, so the ring still reads around both.
    return {
      side: null,
      x: clamp(right - w - TOUR_MARGIN, TOUR_MARGIN, maxX),
      y: clamp(bottom - h - TOUR_MARGIN, TOUR_MARGIN, maxY),
      pointer: 0,
    };
  }

  if (side === 'left' || side === 'right') {
    const y = clamp(centreY - h / 2, TOUR_MARGIN, maxY);
    return {
      side,
      x: side === 'right' ? right + TOUR_GAP : target.x - TOUR_GAP - w,
      y,
      pointer: clamp(centreY - y, POINTER_INSET, h - POINTER_INSET),
    };
  }

  const x = clamp(centreX - w / 2, TOUR_MARGIN, maxX);
  return {
    side,
    x,
    y: side === 'bottom' ? bottom + TOUR_GAP : target.y - TOUR_GAP - h,
    pointer: clamp(centreX - x, POINTER_INSET, w - POINTER_INSET),
  };
}
