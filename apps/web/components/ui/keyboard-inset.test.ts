import { keyboardInset } from './keyboard-inset';

describe('keyboardInset', () => {
  it('reports the height a keyboard covers', () => {
    // iPhone 14: 844 layout, the keyboard leaves 508 visible.
    expect(keyboardInset(844, 508, 0)).toBe(336);
  });

  it('subtracts how far the visual viewport has panned', () => {
    expect(keyboardInset(844, 508, 120)).toBe(216);
  });

  it('ignores small shrinks from browser chrome', () => {
    expect(keyboardInset(844, 790, 0)).toBe(0);
    expect(keyboardInset(844, 844, 0)).toBe(0);
  });
});
