const path = require('path');
const base = require('./device-matrix.config.cjs');

// Mandatory old API process: no silently skipped compatibility check in the R8.3 final pass.
const entry = process.env.R83_OLD_API_ENTRY;
if (!process.env.R82_OLD_API_URL) throw new Error('R82_OLD_API_URL is required');
const oldUrl = new URL(process.env.R82_OLD_API_URL);
if (!entry || !path.isAbsolute(entry)) throw new Error('R83_OLD_API_ENTRY must be absolute');
if (!['localhost', '127.0.0.1'].includes(oldUrl.hostname) || oldUrl.port !== '4001')
  throw new Error('R8.3 compatibility requires isolated local API port 4001');
module.exports = {
  ...base,
  outputDir: process.env.R83_RESULTS_DIR || path.join(__dirname, '../test-results/r83'),
  webServer: [
    ...base.webServer,
    {
      ...base.webServer[0],
      command: "node '" + entry.replaceAll("'", "'\\''") + "'",
      url: `${oldUrl.origin}/health`,
      env: { ...base.webServer[0].env, PORT: '4001' },
      reuseExistingServer: false,
    },
  ],
};
