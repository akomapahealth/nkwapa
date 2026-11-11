import { AVATAR_TONE_COUNT, avatarTone } from './avatar-tone';

describe('avatarTone', () => {
  it('gives the same person the same tone, whatever the case or spacing', () => {
    expect(avatarTone('Ama Mensah')).toBe(avatarTone(' ama mensah '));
  });

  it('stays within the defined tones, including for a missing name', () => {
    for (const seed of ['', null, undefined, 'x', 'Kwame Owusu', 'e2e.nurse@example.test']) {
      const tone = avatarTone(seed);
      expect(tone).toBeGreaterThanOrEqual(1);
      expect(tone).toBeLessThanOrEqual(AVATAR_TONE_COUNT);
    }
  });

  it('spreads a clinic-sized list of names across most tones', () => {
    const names = Array.from({ length: 40 }, (_, index) => `Staff Member ${index}`);
    expect(new Set(names.map(avatarTone)).size).toBeGreaterThanOrEqual(AVATAR_TONE_COUNT - 1);
  });
});
