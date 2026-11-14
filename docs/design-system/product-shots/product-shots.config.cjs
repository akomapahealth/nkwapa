// Landing page product screenshots (MASTER section 12). Light workspace, synthetic data only.
// From apps/web, after an audit-flag build, against a throwaway database seeded with
// packages/db/prisma/seed-screening-day.ts (it refuses anything not named *_shots):
//   WEB_DIR=$PWD SHOTS_DIR=<abs dir> npx playwright test -c ../../docs/design-system/product-shots/product-shots.config.cjs --workers=1
// Override APP_DATABASE_URL as well as DATABASE_URL: the API reads through APP_DATABASE_URL.
const path = require('path');
const web = process.env.WEB_DIR;
if (!web || !process.env.SHOTS_DIR) throw new Error('Set WEB_DIR and SHOTS_DIR.');
for (const name of ['DATABASE_URL', 'APP_DATABASE_URL']) {
  if (!/_shots(\?|$)/.test(process.env[name] || ''))
    throw new Error(
      `${name} must point at a *_shots database: screenshots never show real or e2e data.`,
    );
}
const root = path.resolve(web, '../..');
const base = require(path.join(web, 'playwright.config.js'));
module.exports = {
  ...base,
  retries: 0,
  outputDir: path.join(process.env.SHOTS_DIR, 'test-results'),
  webServer: base.webServer.map((server) => ({ ...server, cwd: root, reuseExistingServer: false })),
  projects: [
    { name: 'setup', testDir: path.join(web, 'e2e'), testMatch: /auth\.setup\.js/ },
    {
      name: 'shots',
      testDir: __dirname,
      testMatch: /capture\.spec\.js/,
      dependencies: ['setup'],
      use: { browserName: 'chromium' },
    },
  ],
};
