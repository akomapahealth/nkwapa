import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Rendered once at build time. The browser only installs a new worker when these bytes change,
// so the per-deploy version below is what makes an update reach installed devices (#206).
export const dynamic = 'force-static';

const SW_VERSION = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

export function GET() {
  const source = readFileSync(join(process.cwd(), 'lib/pwa/service-worker.js'), 'utf8');
  return new Response(source.replace('__SW_VERSION__', SW_VERSION), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // The browser must always ask for the worker, never reuse a stored copy.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
