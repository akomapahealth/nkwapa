import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOnce, verifyWithRetry } from './verify-deploy.mjs';

const env = {
  VERIFY_WEB_URL: 'https://web.example',
  VERIFY_API_URL: 'https://api.example',
  VERIFY_AUTH_ISSUER: 'https://auth.example/realms/nkwapa',
  VERIFY_ENVIRONMENT: 'staging',
  GITHUB_SHA: 'abc123',
};
const names = ['database', 'redis', 'queues', 'email', 'auth', 'web'];
function response(body, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (key) => headers[key] ?? null },
    json: async () => body,
  };
}
function healthyFetch(overrides = {}) {
  return async (url, options = {}) => {
    if (options.method === 'OPTIONS')
      return response({}, { 'access-control-allow-origin': env.VERIFY_WEB_URL });
    if (url.endsWith('/api/version')) return response({ sha: overrides.webSha ?? env.GITHUB_SHA });
    if (url.endsWith('/status'))
      return response({
        status: overrides.status ?? 'operational',
        apiSha: overrides.apiSha ?? env.GITHUB_SHA,
        webSha: overrides.webSha ?? env.GITHUB_SHA,
        components: names.map((name) => ({
          name,
          state: overrides.component === name ? 'degraded' : 'operational',
          reason: 'OK',
        })),
      });
    if (url.endsWith('/.well-known/openid-configuration'))
      return response({ issuer: env.VERIFY_AUTH_ISSUER });
    return response({});
  };
}

test('accepts matching healthy deployments', async () => {
  assert.deepEqual(await verifyOnce(env, { fetcher: healthyFetch() }), { ok: true, failures: [] });
});

test('rejects degraded components and mismatched versions', async () => {
  const degraded = await verifyOnce(env, {
    fetcher: healthyFetch({ component: 'queues', status: 'degraded' }),
  });
  assert.equal(degraded.ok, false);
  assert.match(degraded.failures.join(' '), /queues/);
  const mismatch = await verifyOnce(env, { fetcher: healthyFetch({ webSha: 'old' }) });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.failures.join(' '), /SHA/);
});

test('times out after bounded retries', async () => {
  let time = 0;
  const result = await verifyWithRetry(env, {
    fetcher: async () => {
      throw new Error('timed out');
    },
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    maxMs: 30,
    retryMs: 10,
  });
  assert.equal(result.ok, false);
  assert.equal(time, 30);
  assert.match(result.failures.join(' '), /timed out/);
});

test('requires production fixture credentials', async () => {
  await assert.rejects(
    verifyOnce({ ...env, VERIFY_ENVIRONMENT: 'production' }, { fetcher: healthyFetch() }),
    /VERIFY_READONLY_DATABASE_URL/,
  );
});
