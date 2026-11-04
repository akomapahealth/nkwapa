// #282 route audit. From apps/web: WEB_DIR=$PWD EVIDENCE_DIR=<abs evidence dir>
// npx playwright test -c <this file> --workers=1. Starts the API on 4000 and `next start` on 3000
// (Keycloak redirects only to 3000), so both ports must be free; build the web app first.
const path = require('path');
const web = process.env.WEB_DIR;
if (!web || !process.env.EVIDENCE_DIR) throw new Error('Set WEB_DIR and EVIDENCE_DIR.');
const root = path.resolve(web, '../..');
const base = require(path.join(web, 'playwright.config.js'));
module.exports = {
  ...base,
  testDir: root,
  retries: 0,
  maxFailures: 0,
  webServer: base.webServer.map((server) => ({ ...server, cwd: root, reuseExistingServer: false })),
  projects: [
    { name: 'setup', testMatch: path.join(web, 'e2e/auth.setup.js') },
    {
      name: 'audit',
      testMatch: path.join(__dirname, 'route-audit.spec.js'),
      dependencies: ['setup'],
      use: { browserName: 'chromium' },
    },
  ],
};
