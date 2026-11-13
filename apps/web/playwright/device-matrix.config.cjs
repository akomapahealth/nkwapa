const path = require('path');
const base = require('../playwright.config');
const { requireAuditDatabase } = require('./device-matrix.cjs');

requireAuditDatabase();
module.exports = {
  ...base,
  testDir: path.join(__dirname, '../e2e'),
  workers: 1,
  retries: 0,
  outputDir: process.env.R82_RESULTS_DIR || path.join(__dirname, '../test-results/r82'),
  // An already running API might serve another database. Always start guarded processes.
  webServer: base.webServer.map((server) => ({
    ...server,
    cwd: path.resolve(__dirname, '../../..'),
    reuseExistingServer: false,
  })),
};
