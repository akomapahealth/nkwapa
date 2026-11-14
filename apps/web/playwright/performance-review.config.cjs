const base = require('./device-matrix.config.cjs');
module.exports = {
  ...base,
  maxFailures: 0,
  expect: { timeout: 90_000 },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'performance',
      dependencies: ['setup'],
      testMatch: /performance-review\.spec\.js/,
      use: { browserName: 'chromium', colorScheme: 'light' },
    },
  ],
};
