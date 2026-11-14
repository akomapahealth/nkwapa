const path = require('path');
const base = require('./device-matrix.config.cjs');

const root = path.resolve(__dirname, '../../..');
if (!process.env.EVIDENCE_DIR || !process.env.AUDIT_FIXTURES)
  throw new Error('Set EVIDENCE_DIR and guarded AUDIT_FIXTURES.');
process.env.WEB_DIR = path.join(root, 'apps/web');
process.env.AUDIT_THEMES = 'light';
process.env.AUDIT_WIDTHS = '1440';
process.env.R84_FUNCTIONAL_ONLY = 'true';

module.exports = {
  ...base,
  maxFailures: 0,
  workers: 1,
  retries: 0,
  outputDir: path.join(process.env.EVIDENCE_DIR, 'results'),
  // Playwright's 'missing' mode writes PNGs but deliberately records a soft failure.
  updateSnapshots: process.env.R86_CAPTURE_BASELINE === '1' ? 'all' : 'none',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  grepInvert: /#197/,
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'carried',
      dependencies: ['setup'],
      grep: /clinical-notes\.spec\.js|station-workflow\.spec\.js.*a patient moves|sync-recovery\.spec\.js.*a blocked change|role-navigation\.spec\.js.*(?:director|patient) R8\.3|device-matrix-forms\.spec\.js.*portal forms/,
      use: { browserName: 'chromium' },
    },
    {
      name: 'visual-keyboard',
      dependencies: ['setup'],
      testMatch: /visual-regression\.spec\.js|clinical-keyboard\.spec\.js/,
      use: { browserName: 'chromium', colorScheme: 'light', reducedMotion: 'reduce' },
    },
    {
      name: 'axe-routes',
      dependencies: ['setup'],
      testDir: path.join(root, 'docs/design-system/route-audit'),
      testMatch: /route-audit\.spec\.js/,
      use: { browserName: 'chromium', colorScheme: 'light', reducedMotion: 'reduce' },
    },
  ],
};
