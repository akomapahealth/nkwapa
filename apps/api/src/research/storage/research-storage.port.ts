import type { ResearchStorageProvider } from '@prisma/client';
import type { GeneratedResearchPack } from '../research-policy';

/** One run's pack, with the identity it is stored under (#166). */
export interface ResearchRunPackage {
  exportId: string;
  runKey: string;
  fromDate: string;
  toDate: string;
  pack: GeneratedResearchPack;
}

/** Where a run landed. */
export interface StoredRunRef {
  provider: ResearchStorageProvider;
  /** The run's folder in the bucket or repository. */
  path: string;
  /** The commit sha for GitHub; the run's content hash for an object store. */
  ref: string;
  /** For people: a commit link or the object store URI. */
  url: string | null;
  syncedAt: Date;
}

/**
 * A destination for research runs. The pack contract is the same everywhere; only where the
 * files go differs, so switching destination is configuration, not code.
 */
export interface ResearchStorageAdapter {
  readonly provider: ResearchStorageProvider;
  /** Whether the environment holds what this destination needs. */
  isConfigured(): boolean;
  /**
   * Where `putRun` will put this run. Recorded on the export before the upload (#164), so a lost
   * outcome can be settled by asking the destination with `recoverRun`.
   */
  plannedPath(run: Pick<ResearchRunPackage, 'exportId' | 'runKey' | 'pack'>): string;
  /**
   * Publish the run and move the clinic's "current" pointer to it. Idempotent per run key: a
   * repeat overwrites the same objects with the same bytes.
   */
  putRun(run: ResearchRunPackage): Promise<StoredRunRef>;
  /**
   * The run already stored at `path`, finishing its pointer swap if that was lost, or null when
   * nothing landed. Throws when the destination cannot be asked, which leaves it unknown.
   */
  recoverRun(path: string): Promise<StoredRunRef | null>;
}
