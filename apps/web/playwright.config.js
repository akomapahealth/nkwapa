const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const isCI = Boolean(process.env.CI);
const apiCommand =
  process.env.PLAYWRIGHT_API_COMMAND || 'npm run start:prod --workspace=@nkwapa/api';
const webCommand = process.env.PLAYWRIGHT_WEB_COMMAND || 'npm run start --workspace=@nkwapa/web';

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: apiCommand,
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: !isCI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: process.env.PORT || '4000',
        CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000',
        DATABASE_URL:
          process.env.DATABASE_URL || 'postgresql://nkwapa:nkwapa@localhost:5433/nkwapa',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/nkwapa',
        KEYCLOAK_JWKS_URI:
          process.env.KEYCLOAK_JWKS_URI ||
          'http://localhost:8080/realms/nkwapa/protocol/openid-connect/certs',
      },
    },
    {
      command: webCommand,
      url: `${baseURL}/login`,
      reuseExistingServer: !isCI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: process.env.PORT || '3000',
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
        NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
        NEXT_PUBLIC_KEYCLOAK_REALM: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'nkwapa',
        NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'nkwapa-web',
      },
    },
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'chromium',
      testIgnore: /auth\.setup\.js/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },
  ],
  outputDir: path.join(__dirname, 'test-results'),
});
