import * as fs from 'fs/promises';
import * as path from 'path';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

/** The three object operations a research run needs, over a bucket or a folder. */
export interface ObjectStore {
  /** Write `body` at `key`. The store rejects it if the bytes do not match their sha256. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** The stored size, or null when nothing is at `key`. */
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<Buffer | null>;
  /** A URI for people and logs. */
  uri(key: string): string;
}

export interface S3ObjectStoreConfig {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Cloudflare R2, or any S3-compatible store, through the AWS SDK. */
export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;

  constructor(
    private readonly config: S3ObjectStoreConfig,
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        region: 'auto',
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        // We send our own SHA-256 checksum; the SDK's default CRC is not needed on top.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ChecksumSHA256: createHash('sha256').update(body).digest('base64'),
      }),
    );
  }

  async head(key: string): Promise<{ size: number } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { size: result.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return result.Body ? Buffer.from(await result.Body.transformToByteArray()) : null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  uri(key: string): string {
    return `r2://${this.config.bucket}/${key}`;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata?.httpStatusCode === 404)
  );
}

/** A local folder laid out like the bucket, for development, CI and the e2e suite. */
export class FsObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write then rename, so a reader never sees half a file; the rename replaces atomically.
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, body);
    await fs.rename(temporary, target);
  }

  async head(key: string): Promise<{ size: number } | null> {
    try {
      return { size: (await fs.stat(this.resolve(key))).size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  uri(key: string): string {
    return `file://${this.resolve(key)}`;
  }

  /** Keys are built by the adapter, but a key must still never climb out of the root. */
  private resolve(key: string): string {
    const root = path.resolve(this.root);
    const target = path.resolve(root, key);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Object key escapes the storage root: ${key}`);
    }
    return target;
  }
}
