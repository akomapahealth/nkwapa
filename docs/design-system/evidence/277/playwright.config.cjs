// Run from the repository root with WEB_DIR and EVIDENCE_DIR absolute paths.
const path = require('path');
const web = process.env.WEB_DIR;
if (!web || !process.env.EVIDENCE_DIR) throw new Error('Set WEB_DIR and EVIDENCE_DIR.');
const root = path.resolve(web, '../..');
const base = require(path.join(web, 'playwright.config.js'));
module.exports = {
  ...base,
  testDir: root,
  retries: 0,
  webServer: base.webServer.map((server) => ({ ...server, cwd: root })),
  projects: [
    { name: 'setup', testMatch: path.join(web, 'e2e/auth.setup.js') },
    {
      name: 'capture',
      testMatch: path.join(__dirname, 'capture.spec.js'),
      dependencies: ['setup'],
      use: { browserName: 'chromium' },
    },
  ],
};
