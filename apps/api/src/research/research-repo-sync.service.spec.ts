import { BadRequestException } from '@nestjs/common';
import { ResearchRepoSyncService } from './research-repo-sync.service';

describe('ResearchRepoSyncService', () => {
  let service: ResearchRepoSyncService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.RESEARCH_GITHUB_REPO_OWNER = 'example';
    process.env.RESEARCH_GITHUB_REPO_NAME = 'research-data';
    process.env.RESEARCH_GITHUB_REPO_BRANCH = 'main';
    process.env.RESEARCH_GITHUB_REPO_BASE_PATH = 'clinics';
    process.env.RESEARCH_GITHUB_TOKEN = 'gh-token';
    process.env.RESEARCH_GITHUB_MAX_FILE_BYTES = '1000000';
    process.env.RESEARCH_GITHUB_MAX_TOTAL_BYTES = '2000000';
    service = new ResearchRepoSyncService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.RESEARCH_GITHUB_REPO_OWNER;
    delete process.env.RESEARCH_GITHUB_REPO_NAME;
    delete process.env.RESEARCH_GITHUB_REPO_BRANCH;
    delete process.env.RESEARCH_GITHUB_REPO_BASE_PATH;
    delete process.env.RESEARCH_GITHUB_TOKEN;
    delete process.env.RESEARCH_GITHUB_MAX_FILE_BYTES;
    delete process.env.RESEARCH_GITHUB_MAX_TOTAL_BYTES;
  });

  it('syncs a generated pack into the configured github repository', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ object: { sha: 'base-ref-sha' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tree: { sha: 'base-tree-sha' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sha: 'blob-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sha: 'blob-2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sha: 'tree-2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sha: 'commit-2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

    global.fetch = fetchMock as typeof global.fetch;

    const result = await service.sync(
      {
        id: 'exp-1',
        fromDate: '2026-03-01',
        toDate: '2026-03-21',
      } as never,
      {
        manifest: {
          exportId: 'exp-1',
          clinicKey: 'clinic-key',
          datasetVersion: 1,
          policyVersion: 'research-export-v1',
          fromDate: '2026-03-01',
          toDate: '2026-03-21',
          generatedAt: '2026-03-21T12:00:00.000Z',
          timestampRoundingMinutes: 15,
          rowCounts: { research_measurements: 1 },
          files: [],
        },
        repoFiles: [
          {
            name: 'manifest.json',
            content: '{}\n',
            bytes: 3,
            sha256: 'sha',
          },
        ],
        artifactPath: '/tmp/research-export-exp-1.zip',
        artifactSha256: 'artifact-sha',
        artifactSizeBytes: 128,
        recordCount: 1,
        rowCounts: { research_measurements: 1 },
      },
    );

    expect(result.provider).toBe('GITHUB');
    expect(result.repoPath).toContain('clinics/clinic-key/exports/');
    expect(result.commitUrl).toBe('https://github.com/example/research-data/commit/commit-2');
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('fails early when a file exceeds the github file size guard', async () => {
    await expect(
      service.sync(
        {
          id: 'exp-oversized',
          fromDate: '2026-03-01',
          toDate: '2026-03-21',
        } as never,
        {
          manifest: {
            exportId: 'exp-oversized',
            clinicKey: 'clinic-key',
            datasetVersion: 1,
            policyVersion: 'research-export-v1',
            fromDate: '2026-03-01',
            toDate: '2026-03-21',
            generatedAt: '2026-03-21T12:00:00.000Z',
            timestampRoundingMinutes: 15,
            rowCounts: {},
            files: [],
          },
          repoFiles: [
            {
              name: 'research_measurements.csv',
              content: 'x'.repeat(1_500_000),
              bytes: 1_500_000,
              sha256: 'sha',
            },
          ],
          artifactPath: '/tmp/research-export-exp-oversized.zip',
          artifactSha256: 'artifact-sha',
          artifactSizeBytes: 1_500_000,
          recordCount: 1,
          rowCounts: { research_measurements: 1 },
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
