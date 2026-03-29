import { BadRequestException, Injectable } from "@nestjs/common";
import { ResearchExport } from "@prisma/client";
import {
  GeneratedResearchPack,
  ResearchRepoSyncResult,
} from "./research-policy";

interface GitHubRefResponse {
  object: { sha: string };
}

interface GitHubCommitResponse {
  tree: { sha: string };
}

@Injectable()
export class ResearchRepoSyncService {
  async sync(
    exportRecord: Pick<ResearchExport, "id" | "fromDate" | "toDate">,
    pack: GeneratedResearchPack
  ): Promise<ResearchRepoSyncResult> {
    const config = this.getConfig();
    this.assertFileSizes(config.maxFileBytes, config.maxTotalBytes, pack);

    const snapshotName = `${pack.manifest.generatedAt.replace(/[:.]/g, "-")}__${exportRecord.id}`;
    const repoPath = `${config.basePath}/${pack.manifest.clinicKey}/exports/${snapshotName}`;
    const latestPath = `${config.basePath}/${pack.manifest.clinicKey}/latest.json`;

    const ref = await this.request<GitHubRefResponse>("GET", `/git/ref/heads/${config.branch}`);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await this.request<GitHubCommitResponse>(
      "GET",
      `/git/commits/${baseCommitSha}`
    );

    const latestContent = `${JSON.stringify(
      {
        exportId: exportRecord.id,
        fromDate: exportRecord.fromDate,
        toDate: exportRecord.toDate,
        generatedAt: pack.manifest.generatedAt,
        repoPath,
        rowCounts: pack.rowCounts,
      },
      null,
      2
    )}\n`;

    const tree = [];
    for (const file of [
      ...pack.repoFiles.map((entry) => ({
        path: `${repoPath}/${entry.name}`,
        content: entry.content,
      })),
      { path: latestPath, content: latestContent },
    ]) {
      const blob = await this.request<{ sha: string }>("POST", "/git/blobs", {
        content: Buffer.from(file.content, "utf-8").toString("base64"),
        encoding: "base64",
      });

      tree.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const createdTree = await this.request<{ sha: string }>("POST", "/git/trees", {
      base_tree: baseCommit.tree.sha,
      tree,
    });

    const createdCommit = await this.request<{ sha: string }>("POST", "/git/commits", {
      message: `research-export: ${pack.manifest.clinicKey} ${exportRecord.fromDate}..${exportRecord.toDate} ${exportRecord.id}`,
      tree: createdTree.sha,
      parents: [baseCommitSha],
    });

    await this.request("PATCH", `/git/refs/heads/${config.branch}`, {
      sha: createdCommit.sha,
      force: false,
    });

    return {
      provider: "GITHUB",
      repoPath,
      commitSha: createdCommit.sha,
      commitUrl: `https://github.com/${config.owner}/${config.repo}/commit/${createdCommit.sha}`,
      syncedAt: new Date(),
    };
  }

  private assertFileSizes(
    maxFileBytes: number,
    maxTotalBytes: number,
    pack: GeneratedResearchPack
  ) {
    const totalBytes = pack.repoFiles.reduce((sum, file) => sum + file.bytes, 0);
    if (totalBytes > maxTotalBytes) {
      throw new BadRequestException(
        `Research export exceeds the configured GitHub total size guard (${maxTotalBytes} bytes)`
      );
    }

    const oversized = pack.repoFiles.find((file) => file.bytes > maxFileBytes);
    if (oversized) {
      throw new BadRequestException(
        `${oversized.name} exceeds the configured GitHub file size guard (${maxFileBytes} bytes)`
      );
    }
  }

  private getConfig() {
    const owner = process.env.RESEARCH_GITHUB_REPO_OWNER?.trim();
    const repo = process.env.RESEARCH_GITHUB_REPO_NAME?.trim();
    const branch = process.env.RESEARCH_GITHUB_REPO_BRANCH?.trim() || "main";
    const basePath = process.env.RESEARCH_GITHUB_REPO_BASE_PATH?.trim() || "clinics";
    const token = process.env.RESEARCH_GITHUB_TOKEN?.trim();
    const maxFileBytes = Number(process.env.RESEARCH_GITHUB_MAX_FILE_BYTES ?? 95 * 1024 * 1024);
    const maxTotalBytes = Number(process.env.RESEARCH_GITHUB_MAX_TOTAL_BYTES ?? 250 * 1024 * 1024);

    if (!owner || !repo || !token) {
      throw new BadRequestException(
        "RESEARCH_GITHUB_REPO_OWNER, RESEARCH_GITHUB_REPO_NAME, and RESEARCH_GITHUB_TOKEN must be configured"
      );
    }

    return { owner, repo, branch, basePath, token, maxFileBytes, maxTotalBytes };
  }

  private async request<T = unknown>(
    method: "GET" | "POST" | "PATCH",
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const config = this.getConfig();
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}${endpoint}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "nkwapa-research-export",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: body ? JSON.stringify(body) : undefined,
      }
    );

    if (!response.ok) {
      throw new BadRequestException(
        `GitHub sync failed (${response.status}): ${await response.text()}`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

