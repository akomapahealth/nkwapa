const path = require('path');
const root = path.resolve(__dirname, '../../../..');
const web = path.join(root, 'apps/web');
const base = require(path.join(web, 'playwright.config.js'));
module.exports = {
  ...base,
  testDir: root,
  retries: 0,
  reporter: 'list',
  webServer: base.webServer.map((server) => ({ ...server, cwd: root })),
  projects: [
    {
      name: 'setup',
      testMatch: path.join(web, 'e2e/auth.setup.js'),
      ...(process.env.PUBLIC_REGRESSION ? {} : { grep: /staff user/ }),
    },
    {
      name: 'capture',
      testMatch: process.env.LIGHTHOUSE_MODULE_DIR
        ? [path.join(__dirname, 'capture.spec.js'), path.join(__dirname, 'lighthouse.spec.js')]
        : path.join(__dirname, 'capture.spec.js'),
      dependencies: ['setup'],
      use: { browserName: 'chromium', trace: 'off', video: 'off' },
    },
    ...(process.env.PUBLIC_REGRESSION
      ? [
          {
            name: 'regression',
            testMatch: [
              'public-routes',
              'legal',
              'landing',
              'public-supporting-pages',
              'volunteer-roster',
            ].map((name) => path.join(web, `e2e/${name}.spec.js`)),
            dependencies: ['setup'],
            use: { browserName: 'chromium', trace: 'off', video: 'off' },
          },
        ]
      : []),
  ],
};
