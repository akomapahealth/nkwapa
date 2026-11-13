const path = require('path');
const base = require('./device-matrix.config.cjs');

// One bounded functional run, plus the eight outstanding R8.3 cases. No new visual sweep.
module.exports = {
  ...base,
  maxFailures: 0,
  outputDir: process.env.R84_RESULTS_DIR || path.join(__dirname, '../test-results/r84-r85'),
  grep: /(?:vitals|diabetes-screening|hypertension-assessment|clinician-plan|clinical-notes|prescribing|new-encounter-wizard|offline-replay|sync-recovery|outbox-owner|outbox-other-clinics)\.spec\.js|station-workflow\.spec\.js.*(?:a patient moves|intake runs)|role-navigation\.spec\.js.*(?:director|patient) R8\.3|device-matrix-forms\.spec\.js.*portal forms/,
  grepInvert: /#197|the other-clinics section is accessible/,
  webServer: base.webServer.map((server) => ({
    ...server,
    env: { ...server.env, R84_FUNCTIONAL_ONLY: 'true' },
  })),
};
