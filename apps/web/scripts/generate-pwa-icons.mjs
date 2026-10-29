// Generates the installable-app icons in public/icons from the brand logo (#206).
// Run from apps/web: `node scripts/generate-pwa-icons.mjs`. Commit the output.
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

async function icon(size, { maskable }) {
  // Maskable: full bleed, motif well inside the central 80% safe zone. Any: rounded tile, larger motif.
  const motifSize = Math.round(size * (maskable ? 0.52 : 0.62));
  const offset = Math.round((size - motifSize) / 2);
  const name = maskable ? `icon-maskable-${size}.png` : `icon-${size}.png`;
  await tealCanvas(size, maskable ? 0 : Math.round(size * 0.22))
    .composite([{ input: await motif(motifSize), left: offset, top: offset }])
    .png()
    .toFile(`public/icons/${name}`);
  console.log(`wrote public/icons/${name}`);
}

for (const size of [192, 512]) {
  await icon(size, { maskable: false });
  await icon(size, { maskable: true });
}
