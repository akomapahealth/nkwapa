// Production build inventory. Each route's chunk set is deduplicated, not summed across routes.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const web = path.resolve(__dirname, '..');
const stats = JSON.parse(
  fs.readFileSync(path.join(web, '.next/diagnostics/route-bundle-stats.json'), 'utf8'),
);
const routes = stats.map((entry) => {
  const chunks = [...new Set(entry.firstLoadChunkPaths)];
  return {
    route: entry.route,
    buildFirstLoadJsBytes: entry.firstLoadUncompressedJsBytes,
    measuredRawBytes: chunks.reduce(
      (sum, chunk) => sum + fs.statSync(path.join(web, chunk)).size,
      0,
    ),
    gzipBytes: chunks.reduce(
      (sum, chunk) =>
        sum + zlib.gzipSync(fs.readFileSync(path.join(web, chunk)), { level: 9 }).length,
      0,
    ),
    chunks,
  };
});
process.stdout.write(
  JSON.stringify(
    {
      buildId: fs.readFileSync(path.join(web, '.next/BUILD_ID'), 'utf8').trim(),
      measuredAt: new Date().toISOString(),
      method:
        'Next route-bundle-stats first-load chunk set; gzip level 9 per chunk; excludes prefetch, CSS, fonts and RSC',
      routes,
    },
    null,
    2,
  ) + '\n',
);
