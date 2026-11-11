/** Number of `--avatar-N` tones defined in `app/globals.css`. */
export const AVATAR_TONE_COUNT = 8;

/**
 * Which of the eight avatar tones a person gets, from a stable hash of who they are.
 *
 * Deterministic on purpose: a colour that changed on every render or reload would be noise, and
 * the point is that a colleague is recognisable by colour in chat, the header and their profile.
 * The seed is the display name (or email when there is no name), because that is what every
 * avatar site has; shortcut: a renamed person changes colour, switch to a user id if that bites.
 */
export function avatarTone(seed: string | null | undefined): number {
  const key = (seed ?? '').trim().toLowerCase();
  // FNV-1a, 32-bit: cheap, and spreads short similar names across the tones.
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % AVATAR_TONE_COUNT) + 1;
}

/** Spread onto the element that draws the initials: `<span {...avatarToneProps(name)}>`. */
export function avatarToneProps(seed: string | null | undefined) {
  return { 'data-avatar-tone': String(avatarTone(seed)) };
}
