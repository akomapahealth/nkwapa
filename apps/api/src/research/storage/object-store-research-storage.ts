import { Injectable } from '@nestjs/common';
import { gzipSync } from 'zlib';
import type { ResearchStorageProvider } from '@prisma/client';
import type { ResearchPackManifest } from '../research-policy';
import { FsObjectStore, S3ObjectStore, type ObjectStore } from './object-store';
import type {
  ResearchRunPackage,
  ResearchStorageAdapter,
  StoredRunRef,
} from './research-storage.port';

/**
 * A bucket-shaped research destination (#166):
 *
 * ```
 * research/v<datasetVersion>/clinic=<clinicKey>/runs/<runKey>/
 *   tables/<table>.csv.gz, changes.json, SHA256SUMS.txt, manifest.json
 * research/v<datasetVersion>/clinic=<clinicKey>/current.json
 * research/catalog/runs/<runKey>.json
 * ```
 *
 * Objects go up in that order -- tables, then the summaries, then the manifest -- each with a
 * checksum the store verifies, then every object is checked for its size. Only then does
 * `current.json` move, so a reader following it never meets a half-written run. Runs and
 * pointers live under `research/v`, the prefix the retention lifecycle rule expires; the catalog
 * holds no subject data and is kept.
 */
abstract class ObjectStoreResearchStorage implements ResearchStorageAdapter {
  abstract readonly provider: ResearchStorageProvider;
  abstract isConfigured(): boolean;
  protected abstract store(): ObjectStore;

  plannedPath(run: Pick<ResearchRunPackage, 'runKey' | 'pack'>): string {
    const { datasetVersion, clinicKey } = run.pack.manifest;
    return `${clinicPrefix(datasetVersion, clinicKey)}/runs/${run.runKey}`;
  }

  async putRun(run: ResearchRunPackage): Promise<StoredRunRef> {
    const store = this.store();
    const runPath = this.plannedPath(run);
    const objects = runObjects(run, runPath);

    for (const object of objects) {
      await store.put(object.key, object.body, object.contentType);
    }
    for (const object of objects) {
      const stored = await store.head(object.key);
      if (stored?.size !== object.body.length) {
        throw new Error(`Research object did not verify after upload: ${object.key}`);
      }
    }

    await store.put(
      `research/catalog/runs/${run.runKey}.json`,
      json(catalogEntry(run.pack.manifest, runPath)),
      'application/json',
    );
    await promoteCurrent(store, run.pack.manifest, runPath);
    return this.ref(store, runPath, run.pack.manifest);
  }

  async recoverRun(runPath: string): Promise<StoredRunRef | null> {
    const store = this.store();
    // The manifest goes up last, so its presence means every other object is there.
    const raw = await store.get(`${runPath}/manifest.json`);
    if (!raw) return null;
    const manifest = JSON.parse(raw.toString('utf-8')) as ResearchPackManifest;
    await promoteCurrent(store, manifest, runPath);
    return this.ref(store, runPath, manifest);
  }

  private ref(store: ObjectStore, runPath: string, manifest: ResearchPackManifest): StoredRunRef {
    return {
      provider: this.provider,
      path: runPath,
      ref: manifest.contentSha256,
      url: store.uri(`${runPath}/`),
      syncedAt: new Date(),
    };
  }
}

function clinicPrefix(datasetVersion: number, clinicKey: string): string {
  return `research/v${datasetVersion}/clinic=${clinicKey}`;
}

function json(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

/** Every object of a run, in the order it must be written. */
function runObjects(run: ResearchRunPackage, runPath: string) {
  const files = new Map(run.pack.repoFiles.map((file) => [file.name, file]));
  const summary = (name: string) => {
    const file = files.get(name);
    if (!file) throw new Error(`Research pack is missing ${name}`);
    return { key: `${runPath}/${name}`, body: Buffer.from(file.content, 'utf-8') };
  };
  const tables = run.pack.repoFiles
    .filter((file) => file.name.endsWith('.csv'))
    .map((file) => ({
      key: `${runPath}/tables/${file.name}.gz`,
      // gzip writes no timestamp by default, so the same table gives the same bytes on a rerun.
      body: gzipSync(Buffer.from(file.content, 'utf-8')),
      contentType: 'application/gzip',
    }));
  return [
    ...tables,
    { ...summary('changes.json'), contentType: 'application/json' },
    { ...summary('SHA256SUMS.txt'), contentType: 'text/plain; charset=utf-8' },
    { ...summary('manifest.json'), contentType: 'application/json' },
  ];
}

/** What a run is, without any subject data: for the catalog and the pointer. */
function catalogEntry(manifest: ResearchPackManifest, runPath: string) {
  return {
    runKey: manifest.runKey,
    clinicKey: manifest.clinicKey,
    trigger: manifest.trigger,
    path: runPath,
    datasetVersion: manifest.datasetVersion,
    policyVersion: manifest.policyVersion,
    hmacKeyId: manifest.hmacKeyId,
    fromDate: manifest.fromDate,
    toDate: manifest.toDate,
    generatedAt: manifest.generatedAt,
    consentedSubjects: manifest.consentedSubjects,
    revokedSinceLast: manifest.revokedSinceLast,
    contentSha256: manifest.contentSha256,
    previousRunKey: manifest.previousRunKey,
    rowCounts: manifest.rowCounts,
  };
}

/**
 * Point the clinic's `current.json` at this run, unless it already points at a newer one, so a
 * late retry of an old period never moves researchers backwards.
 */
async function promoteCurrent(
  store: ObjectStore,
  manifest: ResearchPackManifest,
  runPath: string,
): Promise<void> {
  const key = `${clinicPrefix(manifest.datasetVersion, manifest.clinicKey)}/current.json`;
  const existing = await store.get(key);
  if (existing) {
    // shortcut: read-then-write, so two runs of one clinic finishing in the same second could
    // race; the newer generatedAt still wins on the next run. Use a conditional put if that matters.
    const current = JSON.parse(existing.toString('utf-8')) as { generatedAt?: string };
    if (current.generatedAt && current.generatedAt > manifest.generatedAt) return;
  }
  await store.put(key, json(catalogEntry(manifest, runPath)), 'application/json');
}

const R2_JURISDICTIONS = new Set(['eu', 'fedramp']);

/** Cloudflare R2, the recommended destination: revocation can actually erase (#166). */
@Injectable()
export class R2ResearchStorage extends ObjectStoreResearchStorage {
  readonly provider = 'R2' as const;
  private cached: ObjectStore | null = null;

  isConfigured(): boolean {
    return Boolean(
      env('RESEARCH_R2_ACCOUNT_ID') &&
      env('RESEARCH_R2_BUCKET') &&
      env('RESEARCH_R2_ACCESS_KEY_ID') &&
      env('RESEARCH_R2_SECRET_ACCESS_KEY'),
    );
  }

  protected store(): ObjectStore {
    if (this.cached) return this.cached;
    if (!this.isConfigured()) {
      throw new Error(
        'RESEARCH_R2_ACCOUNT_ID, RESEARCH_R2_BUCKET, RESEARCH_R2_ACCESS_KEY_ID and RESEARCH_R2_SECRET_ACCESS_KEY must be configured',
      );
    }
    const jurisdiction = env('RESEARCH_R2_JURISDICTION')?.toLowerCase();
    if (jurisdiction && !R2_JURISDICTIONS.has(jurisdiction)) {
      throw new Error(`RESEARCH_R2_JURISDICTION must be eu or fedramp, not ${jurisdiction}`);
    }
    const host = jurisdiction
      ? `${env('RESEARCH_R2_ACCOUNT_ID')}.${jurisdiction}.r2.cloudflarestorage.com`
      : `${env('RESEARCH_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
    this.cached = new S3ObjectStore({
      bucket: env('RESEARCH_R2_BUCKET') as string,
      endpoint: `https://${host}`,
      accessKeyId: env('RESEARCH_R2_ACCESS_KEY_ID') as string,
      secretAccessKey: env('RESEARCH_R2_SECRET_ACCESS_KEY') as string,
    });
    return this.cached;
  }
}

/**
 * A local folder in the bucket's layout. Offered outside production, or in production only when
 * chosen explicitly, because a server's disk is not where research data should live.
 */
@Injectable()
export class LocalResearchStorage extends ObjectStoreResearchStorage {
  readonly provider = 'LOCAL' as const;

  isConfigured(): boolean {
    return (
      process.env.NODE_ENV !== 'production' ||
      env('RESEARCH_STORAGE_PROVIDER')?.toLowerCase() === 'local'
    );
  }

  protected store(): ObjectStore {
    return new FsObjectStore(env('RESEARCH_LOCAL_STORAGE_DIR') ?? './data/research-storage');
  }
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}
