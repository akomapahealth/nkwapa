import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { HERO_HEADLINE, HERO_LEDE, HERO_PHOTO } from '@/components/landing/hero-content';

/*
  The link-preview card, drawn at build time from the landing hero's own content
  (components/landing/hero-content.ts): its photograph and crop, headline and lede, under the
  landing header's wordmark. Change the hero and the next build's card changes with it.

  Satori cannot read WOFF2 or variable fonts, so app/fonts/og holds static TTF instances of the same
  self-hosted faces (Source Serif 4 at 600, IBM Plex Sans at 400). Colours are the light tokens.
*/

export const alt = `The Nkwapa home page: "${HERO_HEADLINE}" over a photograph of a screening day.`;
export const size = { width: 1200, height: 630 };
// JPEG, not Satori's PNG: the PNG is over 1 MB and WhatsApp drops previews much past 300 KB.
export const contentType = 'image/jpeg';

const HEADER = 64;
const PHOTO_HEIGHT = size.height - HEADER;
const web = process.cwd();

/** The hero photograph scaled to cover the card's photo band, at the hero's wide-screen focus. */
async function heroPhoto() {
  const file = await readFile(join(web, 'public', HERO_PHOTO.src));
  // JPEG frame header (SOF0/SOF2): height then width, big-endian, after the marker and length.
  let at = 2;
  while (file[at + 1] !== 0xc0 && file[at + 1] !== 0xc2) at += 2 + file.readUInt16BE(at + 2);
  const height = file.readUInt16BE(at + 5);
  const width = file.readUInt16BE(at + 7);
  const scale = Math.max(size.width / width, PHOTO_HEIGHT / height);
  return {
    src: `data:image/jpeg;base64,${file.toString('base64')}`,
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    left: -Math.round((width * scale - size.width) * HERO_PHOTO.focusX),
    top: -Math.round((height * scale - PHOTO_HEIGHT) * HERO_PHOTO.focusY),
  };
}

export default async function OpengraphImage() {
  const [serif, sans, wordmark, photo] = await Promise.all([
    readFile(join(web, 'app/fonts/og/source-serif-4-600.ttf')),
    readFile(join(web, 'app/fonts/og/ibm-plex-sans-400.ttf')),
    readFile(join(web, 'public/images/nkwapa-logo.png')),
    heroPhoto(),
  ]);

  const png = new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgb(242, 247, 247)',
      }}
    >
      <div
        style={{
          height: HEADER,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 32,
          borderBottom: '1px solid rgb(219, 228, 230)',
        }}
      >
        {}
        <img
          alt=""
          src={`data:image/png;base64,${wordmark.toString('base64')}`}
          width={118}
          height={32}
        />
      </div>
      <div
        style={{ position: 'relative', display: 'flex', height: PHOTO_HEIGHT, overflow: 'hidden' }}
      >
        {}
        <img
          alt=""
          src={photo.src}
          width={photo.width}
          height={photo.height}
          style={{ position: 'absolute', top: photo.top, left: photo.left }}
        />
        {/* The hero's wide-screen scrim, darkest where the copy sits. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size.width,
            height: PHOTO_HEIGHT,
            backgroundImage:
              'linear-gradient(to top, rgba(11, 18, 20, 0.92) 0%, rgba(11, 18, 20, 0.7) 45%, rgba(11, 18, 20, 0.15) 85%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 32,
            bottom: 52,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ width: 64, height: 2, background: 'rgb(255, 205, 26)' }} />
          <div
            style={{
              marginTop: 24,
              maxWidth: 760,
              fontFamily: 'Source Serif 4',
              fontSize: 76,
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              color: 'white',
            }}
          >
            {HERO_HEADLINE}
          </div>
          <div
            style={{
              marginTop: 28,
              maxWidth: 660,
              fontFamily: 'IBM Plex Sans',
              fontSize: 21,
              lineHeight: 1.5,
              color: 'rgba(255, 255, 255, 0.9)',
            }}
          >
            {HERO_LEDE}
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Source Serif 4', data: serif, weight: 600, style: 'normal' },
        { name: 'IBM Plex Sans', data: sans, weight: 400, style: 'normal' },
      ],
    },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer()))
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': contentType } });
}
