/*
  The box a pointer can actually hit. Small and icon buttons are 32-36px on a mouse but keep a
  44px hit area through an absolutely positioned ::after (MASTER section 8), which boundingBox()
  does not see.
*/
async function hitTarget(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, '::after');
    if (a.content === 'none' || a.position !== 'absolute') {
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    const [top, right, bottom, left] = [a.top, a.right, a.bottom, a.left].map(
      (v) => parseFloat(v) || 0,
    );
    return {
      x: r.x + Math.min(left, 0),
      y: r.y + Math.min(top, 0),
      width: r.width - Math.min(left, 0) - Math.min(right, 0),
      height: r.height - Math.min(top, 0) - Math.min(bottom, 0),
    };
  });
}
/** The smallest visible text button for this pointer: 44px under touch, 36px on a mouse. */
async function minButtonHeight(page) {
  return page.evaluate(() => (matchMedia('(pointer: coarse)').matches ? 44 : 36));
}
module.exports = { hitTarget, minButtonHeight };
