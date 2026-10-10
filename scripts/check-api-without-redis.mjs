#!/usr/bin/env node
/*
  Boots the built API with Redis unreachable and checks that it stays up (#199).

  An ioredis client that gave up on a dead server used to take the whole process down about
  twelve seconds after boot, so a Redis outage was an API outage. This starts `apps/api/dist/main`
  with REDIS_URL pointed at a port nothing listens on, waits for /health to answer, and then holds
  for HOLD_SECONDS checking that the process is alive and /health reports Redis as disconnected
  rather than failing.

  Needs a built API and a reachable database (DATABASE_URL, plus APP_DATABASE_URL when row level
  security is enforced). Everything else the API reads comes from the environment as usual.

    npm run build --workspace=@nkwapa/api
    node scripts/check-api-without-redis.mjs              # 90 s hold
    HOLD_SECONDS=300 node scripts/check-api-without-redis.mjs
*/
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps/api');
const port = process.env.CHECK_PORT ?? '4099';
const deadRedis = process.env.CHECK_REDIS_URL ?? 'redis://127.0.0.1:6390';
const bootTimeoutMs = Number(process.env.BOOT_TIMEOUT_SECONDS ?? 60) * 1000;
const holdMs = Number(process.env.HOLD_SECONDS ?? 90) * 1000;
const pollMs = 5000;

const child = spawn(process.execPath, ['--trace-uncaught', 'dist/main.js'], {
  cwd: apiDir,
  env: { ...process.env, PORT: port, REDIS_URL: deadRedis },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let exited = null;
const tail = [];
const keep = (chunk) => {
  for (const line of chunk.toString().split('\n')) {
    if (!line.trim()) continue;
    tail.push(line);
    if (tail.length > 80) tail.shift();
  }
};
child.stdout.on('data', keep);
child.stderr.on('data', keep);
child.on('exit', (code, signal) => {
  exited = { code, signal };
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`FAIL: ${message}`);
  console.error('--- last API output ---');
  console.error(tail.join('\n'));
  if (!exited) child.kill('SIGKILL');
  process.exit(1);
}

async function health() {
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  console.log(`Booting the API on :${port} with REDIS_URL=${deadRedis}`);
  const bootDeadline = Date.now() + bootTimeoutMs;
  let first = null;
  while (!first) {
    if (exited) fail(`the API exited during boot (${JSON.stringify(exited)})`);
    if (Date.now() > bootDeadline) fail(`/health did not answer within ${bootTimeoutMs / 1000} s`);
    try {
      first = await health();
    } catch {
      await sleep(1000);
    }
  }
  console.log(`/health answered: ${JSON.stringify(first.body)}`);

  const holdUntil = Date.now() + holdMs;
  let last = first;
  while (Date.now() < holdUntil) {
    await sleep(pollMs);
    if (exited) fail(`the API exited while Redis was down (${JSON.stringify(exited)})`);
    try {
      last = await health();
    } catch (error) {
      fail(`/health stopped answering: ${error.message}`);
    }
  }

  const { status, body } = last;
  if (status !== 200) fail(`/health returned HTTP ${status}`);
  if (body?.checks?.redis !== 'disconnected')
    fail(`expected checks.redis "disconnected", got ${JSON.stringify(body?.checks)}`);
  if (body?.checks?.db !== 'connected')
    fail(`expected checks.db "connected", got ${JSON.stringify(body?.checks)}`);
  if (body?.status !== 'degraded') fail(`expected status "degraded", got "${body?.status}"`);

  console.log(`PASS: still up after ${holdMs / 1000} s without Redis: ${JSON.stringify(body)}`);
  child.kill('SIGTERM');
  process.exit(0);
}

main().catch((error) => fail(error.stack ?? String(error)));
