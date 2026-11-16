import { TOUR_GAP, TOUR_MARGIN, placeTourCard } from './welcome-tour-placement';

const card = { width: 360, height: 260 };
const viewport = { width: 1280, height: 800 };

describe('placeTourCard', () => {
  it('centres the card when there is nothing to point at', () => {
    expect(placeTourCard(null, card, viewport)).toEqual({ side: null, x: 460, y: 270, pointer: 0 });
  });

  it('puts it right of a sidebar link, pointing at the link', () => {
    const link = { x: 12, y: 300, width: 208, height: 44 };
    const placed = placeTourCard(link, card, viewport);
    expect(placed.side).toBe('right');
    expect(placed.x).toBe(220 + TOUR_GAP);
    // The pointer lands on the link's middle.
    expect(placed.y + placed.pointer).toBe(322);
  });

  it('puts it below a header control, kept inside the viewport', () => {
    const bell = { x: 1200, y: 8, width: 40, height: 40 };
    const placed = placeTourCard(bell, card, viewport);
    expect(placed.side).toBe('bottom');
    expect(placed.y).toBe(48 + TOUR_GAP);
    expect(placed.x + card.width).toBe(viewport.width - TOUR_MARGIN);
    // Clamped against the edge, the pointer still reaches toward the bell.
    expect(placed.x + placed.pointer).toBe(1220);
  });

  it('lays the card over a target that fills the screen', () => {
    const work = { x: 240, y: 70, width: 1020, height: 720 };
    const placed = placeTourCard(work, card, viewport);
    expect(placed.side).toBeNull();
    expect(placed.x + card.width).toBeLessThanOrEqual(viewport.width - TOUR_MARGIN);
    expect(placed.y + card.height).toBeLessThanOrEqual(viewport.height - TOUR_MARGIN);
  });

  it('keeps the pointer off the card corners', () => {
    const nearTop = { x: 2, y: 20, width: 208, height: 10 };
    const placed = placeTourCard(nearTop, card, viewport);
    expect(placed.side).toBe('right');
    expect(placed.y).toBe(TOUR_MARGIN);
    expect(placed.pointer).toBe(20);
  });
});
