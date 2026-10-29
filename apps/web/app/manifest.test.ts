import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import manifest from './manifest';
import { APP_COLORS } from '@/lib/app-identity';

const PUBLIC_DIR = join(__dirname, '..', 'public');

/** Width and height from a PNG's IHDR chunk, which always starts at byte 16. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

/** Reads `--token: H S% L%` from the given selector block of globals.css. */
function cssToken(selector: ':root' | '.dark', token: string): string {
  const css = readFileSync(join(__dirname, 'globals.css'), 'utf8');
  const block = css.slice(css.indexOf(`${selector} {`));
  const match = block.match(new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!match) throw new Error(`--${token} not found in ${selector}`);
  return hslToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

describe('web manifest', () => {
  const original = process.env.NEXT_PUBLIC_FEATURE_PWA_INSTALL_ENABLED;
  afterEach(() => {
    process.env.NEXT_PUBLIC_FEATURE_PWA_INSTALL_ENABLED = original;
  });

  it('declares a stable identity that launches inside its own scope', () => {
    const m = manifest();
    expect(m.id).toBe('/');
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/login?source=pwa');
    expect(m.start_url!.startsWith(m.scope!)).toBe(true);
  });

  it('points every icon at a real PNG of the declared size', () => {
    for (const icon of manifest().icons ?? []) {
      const file = join(PUBLIC_DIR, icon.src);
      expect(existsSync(file)).toBe(true);
      const { width, height } = pngSize(file);
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });

  it('ships a separate maskable icon of at least 512px', () => {
    const icons = manifest().icons ?? [];
    // 'any maskable' on one icon makes Android crop the unpadded artwork.
    expect(icons.every((icon) => icon.purpose !== ('any maskable' as never))).toBe(true);
    expect(
      icons.some((icon) => icon.purpose === 'maskable' && Number(icon.sizes?.split('x')[0]) >= 512),
    ).toBe(true);
  });

  it('uses the app color constants', () => {
    const m = manifest();
    expect(m.background_color).toBe(APP_COLORS.lightBackground);
    expect(m.theme_color).toBe(APP_COLORS.lightPrimary);
  });

  it('keeps the color constants equal to the globals.css tokens', () => {
    expect(APP_COLORS.lightBackground).toBe(cssToken(':root', 'background'));
    expect(APP_COLORS.lightPrimary).toBe(cssToken(':root', 'primary'));
    expect(APP_COLORS.darkBackground).toBe(cssToken('.dark', 'background'));
  });

  it('adds shortcuts only behind the install flag, all inside scope', () => {
    process.env.NEXT_PUBLIC_FEATURE_PWA_INSTALL_ENABLED = 'false';
    expect(manifest().shortcuts).toBeUndefined();

    process.env.NEXT_PUBLIC_FEATURE_PWA_INSTALL_ENABLED = 'true';
    const shortcuts = manifest().shortcuts ?? [];
    expect(shortcuts.map((s) => s.url)).toEqual([
      '/dashboard?source=pwa-shortcut',
      '/patients?source=pwa-shortcut',
    ]);
  });
});
