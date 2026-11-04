// Evidence-only runner: use already-running owned servers; never bind shared ports or start infra.
const path = require('path');
const web = path.resolve(__dirname, '../../../../apps/web');
const base = require(path.join(web, 'playwright.config.js'));
module.exports = {
  ...base,
  testDir: path.join(web, 'e2e'),
  webServer: undefined,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    ...base.use,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3100',
    serviceWorkers: 'block',
    proxy: process.env.LOCAL_BROWSER_PROXY
      ? { server: process.env.LOCAL_BROWSER_PROXY, bypass: '<-loopback>' }
      : undefined,
  },
};
