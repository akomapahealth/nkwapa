// Route audit (#282, re-run for #313): every seeded identity walks its routes in light and dark at
// 1440 and 390 with axe. Read-only. From apps/web, after a build with the CI e2e env and flags:
//   WEB_DIR=$PWD EVIDENCE_DIR=<abs dir> npx playwright test -c ../../docs/design-system/route-audit/route-audit.config.cjs --workers=1
// It writes EVIDENCE_DIR/route-audit.json. AUDIT_ROLES=staff,manager limits the identities.
const path = require('path');
const web = process.env.WEB_DIR;
if (!web || !process.env.EVIDENCE_DIR) throw new Error('Set WEB_DIR and EVIDENCE_DIR.');
const root = path.resolve(web, '../..');
const base = require(path.join(web, 'playwright.config.js'));
module.exports = {
  ...base,
  retries: 0,
  maxFailures: 0,
  outputDir: path.join(process.env.EVIDENCE_DIR, 'test-results'),
  webServer: base.webServer.map((server) => ({ ...server, cwd: root, reuseExistingServer: false })),
  projects: [
    { name: 'setup', testDir: path.join(web, 'e2e'), testMatch: /auth\.setup\.js/ },
    {
      name: 'audit',
      testDir: __dirname,
      testMatch: /route-audit\.spec\.js/,
      dependencies: ['setup'],
      use: { browserName: 'chromium' },
    },
  ],
};
