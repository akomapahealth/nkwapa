import { isInGhana, normalizeDigitalAddress, parsePosition } from './ghana-locations';

describe('normalizeDigitalAddress', () => {
  it.each([
    ['ga1838164', 'GA-183-8164'],
    ['GA-183-8164', 'GA-183-8164'],
    [' ga 183 8164 ', 'GA-183-8164'],
    ['AK-0394-1234', 'AK-0394-1234'],
    ['g21838164', 'G2-183-8164'],
  ])('stores %s as %s', (input, expected) => {
    expect(normalizeDigitalAddress(input)).toBe(expected);
  });

  it.each(['12345', '', 'GA-18-8164', 'GA-183-816', 'Accra', '1A-183-8164'])(
    'refuses %s',
    (input) => {
      expect(normalizeDigitalAddress(input)).toBeNull();
    },
  );
});

describe('parsePosition', () => {
  it.each([
    ['5.6037, -0.1870', 5.6037, -0.187],
    ['5.6037 -0.1870', 5.6037, -0.187],
    ['https://www.google.com/maps/@5.6037,-0.187,15z', 5.6037, -0.187],
    ['https://maps.google.com/?q=5.6037,-0.187', 5.6037, -0.187],
    ['https://www.google.com/maps/search/?api=1&query=5.6037%2C-0.187', 5.6037, -0.187],
    ['geo:6.6885,-1.6244', 6.6885, -1.6244],
    // The pin (!3d/!4d) wins over the map centre (@).
    [
      'https://www.google.com/maps/place/Osu/@5.55,-0.18,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d5.5571234!4d-0.1817899',
      5.557123,
      -0.18179,
    ],
  ])('reads %s', (input, latitude, longitude) => {
    expect(parsePosition(input)).toEqual({ ok: true, latitude, longitude });
  });

  it('refuses text with no coordinates', () => {
    expect(parsePosition('blue kiosk by the church')).toEqual({
      ok: false,
      reason: 'no-coordinates',
    });
  });

  it('flags short share links, which carry no coordinates', () => {
    expect(parsePosition('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      ok: false,
      reason: 'short-link',
    });
  });

  it('refuses a position outside Ghana', () => {
    expect(parsePosition('51.5074, -0.1278')).toEqual({ ok: false, reason: 'outside-ghana' });
  });
});

describe('isInGhana', () => {
  it('accepts the corners and refuses just past them', () => {
    expect(isInGhana(4.5, -3.5)).toBe(true);
    expect(isInGhana(11.5, 1.5)).toBe(true);
    expect(isInGhana(4.49, 0)).toBe(false);
    expect(isInGhana(8, 1.51)).toBe(false);
    expect(isInGhana(Number.NaN, 0)).toBe(false);
  });
});
