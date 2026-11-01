// Generates every square brand icon from the brand logo: the installable-app icons (#206), the
// favicons, the iOS home-screen icon and the sidebar mark. The source is 3:2, so nothing may be
// resized from it directly; each icon is drawn fresh from the extracted motif.
// Run from apps/web: `node scripts/generate-pwa-icons.mjs`. Commit the output.
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCE = 'public/images/nkwapa-favicon-logo.png';
// The yellow motif inside the logo's teal square, measured from the source.
const MOTIF = { left: 398, top: 150, width: 742, height: 747 };
const TEAL = { r: 0, g: 137, b: 165 };
const YELLOW = { r: 255, g: 218, b: 68 };

// Key the motif out of the teal by its red channel (teal has none), so edges keep their antialiasing.
async function motif(size) {
  const { data, info } = await sharp(SOURCE)
    .extract(MOTIF)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = YELLOW.r;
    out[i + 1] = YELLOW.g;
    out[i + 2] = YELLOW.b;
    out[i + 3] = data[i];
  }
  return sharp(out, { raw: info })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function tealCanvas(size, radius) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="rgb(${TEAL.r},${TEAL.g},${TEAL.b})"/></svg>`;
  return sharp(Buffer.from(svg));
}

/** A teal tile with the motif centred. radius 0 is full bleed, for platforms that mask it. */
async function tile(size, { motifScale, radius }) {
  const motifSize = Math.round(size * motifScale);
  const offset = Math.round((size - motifSize) / 2);
  return tealCanvas(size, Math.round(size * radius))
    .composite([{ input: await motif(motifSize), left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function write(path, buffer) {
  await sharp(buffer).toFile(path);
  console.log(`wrote ${path}`);
}

// An .ico holding PNG images, which every current browser reads.
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

// Install icons. Maskable: full bleed, motif inside the central 80% safe zone.
for (const size of [192, 512]) {
  await write(
    `public/icons/icon-${size}.png`,
    await tile(size, { motifScale: 0.62, radius: 0.22 }),
  );
  await write(
    `public/icons/icon-maskable-${size}.png`,
    await tile(size, { motifScale: 0.52, radius: 0 }),
  );
}

// iOS ignores transparency (it fills it with black) and rounds the corners itself, so the
// home-screen icon is an opaque, square, full-bleed tile.
await write(
  'public/images/favicon/apple-touch-icon.png',
  await sharp(await tile(180, { motifScale: 0.62, radius: 0 }))
    .flatten({ background: TEAL })
    .png()
    .toBuffer(),
);

// Tab icons are tiny, so the motif fills more of a less rounded tile to stay legible.
const favicon = (size) => tile(size, { motifScale: 0.8, radius: 0.18 });
await write('public/images/favicon/favicon-16x16.png', await favicon(16));
await write('public/images/favicon/favicon-32x32.png', await favicon(32));
await writeFile(
  'public/images/favicon/favicon.ico',
  ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await favicon(size) })))),
);
console.log('wrote public/images/favicon/favicon.ico');

// The collapsed sidebar and welcome tour mark, shown at 40-44 CSS px (256 covers 3x screens).
await write('public/images/nkwapa-mark.png', await tile(256, { motifScale: 0.7, radius: 0.22 }));
