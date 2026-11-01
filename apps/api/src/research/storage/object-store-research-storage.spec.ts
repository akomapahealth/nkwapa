import { gunzipSync } from 'zlib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { LocalResearchStorage, R2ResearchStorage } from './object-store-research-storage';
import { makeRunPackage } from '../../testing/research-run-fixtures';

const R2_ENV = {
  RESEARCH_R2_ACCOUNT_ID: 'acct123',
  RESEARCH_R2_BUCKET: 'nkwapa-research',
  RESEARCH_R2_ACCESS_KEY_ID: 'key-id',
  RESEARCH_R2_SECRET_ACCESS_KEY: 'secret',
};

function notFound() {
  return new S3ServiceException({
    name: 'NotFound',
    $fault: 'client',
    $metadata: { httpStatusCode: 404 },
  });
}

/** A bucket in memory behind S3Client.send, recording every call in order. */
function mockBucket() {
  const objects = new Map<string, Buffer>();
  const calls: string[] = [];
  let shrinkOnHead: string | null = null;
  const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command) => {
    const input = (command as { input: { Key: string; Body?: Buffer } }).input;
    if (command instanceof PutObjectCommand) {
      calls.push(`put ${input.Key}`);
      objects.set(input.Key, input.Body as Buffer);
      return {};
    }
    if (command instanceof HeadObjectCommand) {
      calls.push(`head ${input.Key}`);
      const body = objects.get(input.Key);
      if (!body) throw notFound();
      return { ContentLength: input.Key === shrinkOnHead ? body.length - 1 : body.length };
    }
    if (command instanceof GetObjectCommand) {
      calls.push(`get ${input.Key}`);
      const body = objects.get(input.Key);
      if (!body) throw notFound();
      return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
    }
    throw new Error('unexpected command');
  });
  return {
    objects,
    calls,
    send,
    failVerificationOf(key: string) {
      shrinkOnHead = key;
    },
  };
}

describe('R2ResearchStorage', () => {
  const original = { ...process.env };
  let bucket: ReturnType<typeof mockBucket>;
  let storage: R2ResearchStorage;

  beforeEach(() => {
    Object.assign(process.env, R2_ENV);
    bucket = mockBucket();
    storage = new R2ResearchStorage();
  });

  afterEach(() => {
    bucket.send.mockRestore();
    process.env = { ...original };
  });

  const runPath = 'research/v5/clinic=3f9a2c1d5e6b7a8c9d0e1f2a3b4c5d6e/runs/rx-3f9a2c1d-m2026-10';
  const currentKey = 'research/v5/clinic=3f9a2c1d5e6b7a8c9d0e1f2a3b4c5d6e/current.json';

  it('is configured only with an account, bucket and both keys', () => {
    expect(storage.isConfigured()).toBe(true);
    delete process.env.RESEARCH_R2_SECRET_ACCESS_KEY;
    expect(storage.isConfigured()).toBe(false);
  });

  it('lays a run out by dataset version, clinic key and run key', () => {
    expect(storage.plannedPath(makeRunPackage())).toBe(runPath);
  });

  it('writes tables, then summaries, then the manifest, and moves current.json last', async () => {
    const result = await storage.putRun(makeRunPackage());

    const puts = bucket.calls.filter((call) => call.startsWith('put '));
    expect(puts).toEqual([
      `put ${runPath}/tables/research_subjects.csv.gz`,
      `put ${runPath}/tables/research_revocations.csv.gz`,
      `put ${runPath}/changes.json`,
      `put ${runPath}/SHA256SUMS.txt`,
      `put ${runPath}/manifest.json`,
      'put research/catalog/runs/rx-3f9a2c1d-m2026-10.json',
      `put ${currentKey}`,
    ]);
    const lastHead = bucket.calls.map((call) => call.startsWith('head ')).lastIndexOf(true);
    expect(bucket.calls.indexOf(`put ${currentKey}`)).toBeGreaterThan(lastHead);
    expect(result).toMatchObject({
      provider: 'R2',
      path: runPath,
      ref: 'c'.repeat(64),
      url: `r2://nkwapa-research/${runPath}/`,
    });
  });

  it('sends a sha256 checksum with every object, so R2 rejects a corrupted upload', async () => {
    await storage.putRun(makeRunPackage());
    const puts = bucket.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof PutObjectCommand);
    for (const command of puts) {
      expect((command as PutObjectCommand).input.ChecksumSHA256).toMatch(/^[A-Za-z0-9+/]+=*$/);
    }
  });

  it('stores tables gzipped, decompressing to the exact CSV the checksums cover', async () => {
    const run = makeRunPackage();
    await storage.putRun(run);
    const stored = gunzipSync(bucket.objects.get(`${runPath}/tables/research_subjects.csv.gz`)!);
    expect(stored.toString('utf-8')).toBe(run.pack.repoFiles[0].content);
  });

  it('never moves current.json when an object does not verify', async () => {
    bucket.failVerificationOf(`${runPath}/manifest.json`);
    await expect(storage.putRun(makeRunPackage())).rejects.toThrow(/did not verify/);
    expect(bucket.objects.has(currentKey)).toBe(false);
  });

  it('overwrites a repeated run with identical bytes', async () => {
    await storage.putRun(makeRunPackage());
    const first = new Map(bucket.objects);
    await storage.putRun(makeRunPackage());
    for (const [key, body] of first) {
      expect(bucket.objects.get(key)?.equals(body)).toBe(true);
    }
  });

  it('does not move current.json back to an older run', async () => {
    const newer = makeRunPackage({ runKey: 'rx-3f9a2c1d-m2026-11' });
    newer.pack.manifest = {
      ...newer.pack.manifest,
      runKey: 'rx-3f9a2c1d-m2026-11',
      generatedAt: '2026-11-01T03:00:00.000Z',
    };
    await storage.putRun(newer);
    await storage.putRun(makeRunPackage());
    const current = JSON.parse(bucket.objects.get(currentKey)!.toString('utf-8'));
    expect(current.runKey).toBe('rx-3f9a2c1d-m2026-11');
  });

  describe('recovering a run whose outcome was lost', () => {
    it('reports nothing when the manifest never landed', async () => {
      await expect(storage.recoverRun(runPath)).resolves.toBeNull();
    });

    it('finds a run whose manifest landed and finishes its pointer swap', async () => {
      await storage.putRun(makeRunPackage());
      bucket.objects.delete(currentKey);

      const recovered = await storage.recoverRun(runPath);

      expect(recovered).toMatchObject({ provider: 'R2', path: runPath });
      expect(JSON.parse(bucket.objects.get(currentKey)!.toString('utf-8')).runKey).toBe(
        'rx-3f9a2c1d-m2026-10',
      );
    });

    it('throws when the bucket cannot be asked, rather than guessing', async () => {
      bucket.send.mockRejectedValueOnce(new Error('connect ETIMEDOUT') as never);
      await expect(storage.recoverRun(runPath)).rejects.toThrow('ETIMEDOUT');
    });
  });

  it('refuses a jurisdiction R2 does not have', async () => {
    process.env.RESEARCH_R2_JURISDICTION = 'af';
    await expect(new R2ResearchStorage().putRun(makeRunPackage())).rejects.toThrow(/eu or fedramp/);
  });
});

describe('LocalResearchStorage', () => {
  const original = { ...process.env };
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-storage-'));
    process.env.RESEARCH_LOCAL_STORAGE_DIR = root;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    process.env = { ...original };
  });

  it('writes the same layout as the bucket into a folder', async () => {
    const storage = new LocalResearchStorage();
    const result = await storage.putRun(makeRunPackage());

    const runDir = path.join(root, result.path);
    expect(fs.readdirSync(runDir).sort()).toEqual([
      'SHA256SUMS.txt',
      'changes.json',
      'manifest.json',
      'tables',
    ]);
    expect(fs.existsSync(path.join(root, result.path, '..', '..', 'current.json'))).toBe(true);
    await expect(storage.recoverRun(result.path)).resolves.toMatchObject({ provider: 'LOCAL' });
  });

  it('is not offered in production unless chosen explicitly', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RESEARCH_STORAGE_PROVIDER;
    expect(new LocalResearchStorage().isConfigured()).toBe(false);
    process.env.RESEARCH_STORAGE_PROVIDER = 'local';
    expect(new LocalResearchStorage().isConfigured()).toBe(true);
  });
});
