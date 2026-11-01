import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { redactLogValue } from '../../common/redaction';
import type { GeneratedResearchPack } from '../research-policy';
import type {
  ResearchRunPackage,
  ResearchStorageAdapter,
  StoredRunRef,
} from './research-storage.port';

interface GitHubRefResponse {
  object: { sha: string };
}

interface GitHubCommitResponse {
  tree: { sha: string };
}

interface RepoFile {
  path: string;
  content: string;
}

/**
 * The private GitHub repository as a research destination.
 *
 * Git keeps every past commit, so a revoked subject's rows stay in old commits. That is why R2
 * is the recommended destination (#166); this one stays selectable for clinics already using it.
 */
@Injectable()
export class GithubResearchStorage implements ResearchStorageAdapter {
  readonly provider = 'GITHUB' as const;
  private readonly logger = new Logger(GithubResearchStorage.name);

  isConfigured(): boolean {
    return Boolean(
      process.env.RESEARCH_GITHUB_REPO_OWNER?.trim() &&
      process.env.RESEARCH_GITHUB_REPO_NAME?.trim() &&
      process.env.RESEARCH_GITHUB_TOKEN?.trim(),
    );
  }

  /** The snapshot directory is unique to one run of one export, unchanged since #164. */
  plannedPath(
    run: Pick<ResearchRunPackage, 'exportId'> & {
      pack: { manifest: Pick<GeneratedResearchPack['manifest'], 'clinicKey' | 'generatedAt'> };
    },
  ): string {
    const config = this.getConfig();
    const snapshotName = `${run.pack.manifest.generatedAt.replace(/[:.]/g, '-')}__${run.exportId}`;
    return `${config.basePath}/${run.pack.manifest.clinicKey}/exports/${snapshotName}`;
  }

  /**
   * The commit that put a snapshot at `path` on the export branch, or null if none did.
   *
   * A commit touching the run's own directory is that run's push. This is how a push whose
   * outcome was lost is settled without pushing again. `latest.json` is written in the same
   * commit, so there is no pointer left to finish.
   */
  async recoverRun(path: string): Promise<StoredRunRef | null> {
    const config = this.getConfig();
    const query = new URLSearchParams({ sha: config.branch, path, per_page: '1' });
    const commits = await this.request<
      Array<{ sha: string; commit: { committer?: { date?: string } } }>
    >('GET', `/commits?${query.toString()}`);
    const [commit] = commits ?? [];
    if (!commit) return null;
    const committedAt = commit.commit.committer?.date;
    return this.ref(path, commit.sha, committedAt ? new Date(committedAt) : new Date());
  }

  async putRun(run: ResearchRunPackage): Promise<StoredRunRef> {
    const config = this.getConfig();
    const { pack } = run;
    this.assertFileSizes(config.maxFileBytes, config.maxTotalBytes, pack);

    const path = this.plannedPath(run);
    const latestContent = `${JSON.stringify(
      {
        exportId: run.exportId,
        runKey: run.runKey,
        fromDate: run.fromDate,
        toDate: run.toDate,
        generatedAt: pack.manifest.generatedAt,
        repoPath: path,
        rowCounts: pack.rowCounts,
      },
      null,
      2,
    )}\n`;

    const commitSha = await this.commitFiles(
      [
        ...pack.repoFiles.map((entry) => ({
          path: `${path}/${entry.name}`,
          content: entry.content,
        })),
        {
          path: `${config.basePath}/${pack.manifest.clinicKey}/latest.json`,
          content: latestContent,
        },
      ],
      `research-export: ${pack.manifest.clinicKey} ${run.fromDate}..${run.toDate} ${run.runKey}`,
    );
    return this.ref(path, commitSha, new Date());
  }

  /**
   * Mirror a run's manifest and change summary, no tables, when another destination holds the
   * data (#166). Researchers who watch the repository still see every run.
   */
  async mirrorManifest(run: ResearchRunPackage): Promise<StoredRunRef> {
    const config = this.getConfig();
    const path = `${config.basePath}/${run.pack.manifest.clinicKey}/runs/${run.runKey}`;
    const files = run.pack.repoFiles.filter((file) =>
      ['manifest.json', 'changes.json'].includes(file.name),
    );
    const commitSha = await this.commitFiles(
      files.map((file) => ({ path: `${path}/${file.name}`, content: file.content })),
      `research-run: ${run.runKey} manifest`,
    );
    return this.ref(path, commitSha, new Date());
  }

  private ref(path: string, commitSha: string, syncedAt: Date): StoredRunRef {
    const config = this.getConfig();
    return {
      provider: this.provider,
      path,
      ref: commitSha,
      url: `https://github.com/${config.owner}/${config.repo}/commit/${commitSha}`,
      syncedAt,
    };
  }

  /** One commit on the export branch adding `files`, through the Git Data API. */
  private async commitFiles(files: RepoFile[], message: string): Promise<string> {
    const config = this.getConfig();
    const ref = await this.request<GitHubRefResponse>('GET', `/git/ref/heads/${config.branch}`);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await this.request<GitHubCommitResponse>(
      'GET',
      `/git/commits/${baseCommitSha}`,
    );

    const tree = [];
    for (const file of files) {
      const blob = await this.request<{ sha: string }>('POST', '/git/blobs', {
        content: Buffer.from(file.content, 'utf-8').toString('base64'),
        encoding: 'base64',
      });
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const createdTree = await this.request<{ sha: string }>('POST', '/git/trees', {
      base_tree: baseCommit.tree.sha,
      tree,
    });
    const createdCommit = await this.request<{ sha: string }>('POST', '/git/commits', {
      message,
      tree: createdTree.sha,
      parents: [baseCommitSha],
    });
    await this.request('PATCH', `/git/refs/heads/${config.branch}`, {
      sha: createdCommit.sha,
      force: false,
    });
    return createdCommit.sha;
  }

  private assertFileSizes(
    maxFileBytes: number,
    maxTotalBytes: number,
    pack: GeneratedResearchPack,
  ) {
    const totalBytes = pack.repoFiles.reduce((sum, file) => sum + file.bytes, 0);
    if (totalBytes > maxTotalBytes) {
      throw new BadRequestException(
        `Research export exceeds the configured GitHub total size guard (${maxTotalBytes} bytes)`,
      );
    }

    const oversized = pack.repoFiles.find((file) => file.bytes > maxFileBytes);
    if (oversized) {
      throw new BadRequestException(
        `${oversized.name} exceeds the configured GitHub file size guard (${maxFileBytes} bytes)`,
      );
    }
  }

  private getConfig() {
    const owner = process.env.RESEARCH_GITHUB_REPO_OWNER?.trim();
    const repo = process.env.RESEARCH_GITHUB_REPO_NAME?.trim();
    const branch = process.env.RESEARCH_GITHUB_REPO_BRANCH?.trim() || 'main';
    const basePath = process.env.RESEARCH_GITHUB_REPO_BASE_PATH?.trim() || 'clinics';
    const token = process.env.RESEARCH_GITHUB_TOKEN?.trim();
    const maxFileBytes = Number(process.env.RESEARCH_GITHUB_MAX_FILE_BYTES ?? 95 * 1024 * 1024);
    const maxTotalBytes = Number(process.env.RESEARCH_GITHUB_MAX_TOTAL_BYTES ?? 250 * 1024 * 1024);

    if (!owner || !repo || !token) {
      throw new BadRequestException(
        'RESEARCH_GITHUB_REPO_OWNER, RESEARCH_GITHUB_REPO_NAME, and RESEARCH_GITHUB_TOKEN must be configured',
      );
    }

    return { owner, repo, branch, basePath, token, maxFileBytes, maxTotalBytes };
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH',
    endpoint: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const config = this.getConfig();
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}${endpoint}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'nkwapa-research-export',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );

    if (!response.ok) {
      const responseText = await response.text();
      this.logger.warn(
        JSON.stringify({
          message: 'GitHub research sync request failed',
          status: response.status,
          endpoint,
          error: redactLogValue(responseText),
        }),
      );
      throw new BadRequestException(`GitHub sync failed (${response.status})`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
