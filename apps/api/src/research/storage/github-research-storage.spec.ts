import { BadRequestException } from '@nestjs/common';
import { GithubResearchStorage } from './github-research-storage';
import { makeRunPackage, packFile } from '../../testing/research-run-fixtures';

describe('GithubResearchStorage', () => {
  let service: GithubResearchStorage;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.RESEARCH_GITHUB_REPO_OWNER = 'example';
    process.env.RESEARCH_GITHUB_REPO_NAME = 'research-data';
    process.env.RESEARCH_GITHUB_REPO_BRANCH = 'main';
    process.env.RESEARCH_GITHUB_REPO_BASE_PATH = 'clinics';
    process.env.RESEARCH_GITHUB_TOKEN = 'gh-token';
    process.env.RESEARCH_GITHUB_MAX_FILE_BYTES = '1000000';
    process.env.RESEARCH_GITHUB_MAX_TOTAL_BYTES = '2000000';
    service = new GithubResearchStorage();
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

  /** Responses for one commit of `blobs` files: ref, base commit, blobs, tree, commit, ref update. */
  function commitResponses(blobs: number) {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ object: { sha: 'base' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tree: { sha: 'base-tree' } }),
      });
    for (let index = 0; index < blobs; index += 1) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sha: `blob-${index}` }),
      });
    }
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ sha: 'tree-2' }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ sha: 'commit-2' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as typeof global.fetch;
    return fetchMock;
  }

  it('publishes a run into the configured github repository with latest.json in the same commit', async () => {
    const run = makeRunPackage();
    const fetchMock = commitResponses(run.pack.repoFiles.length + 1);

    const result = await service.putRun(run);

    expect(result.provider).toBe('GITHUB');
    expect(result.path).toContain('clinics/3f9a2c1d5e6b7a8c9d0e1f2a3b4c5d6e/exports/');
    expect(result.ref).toBe('commit-2');
    expect(result.url).toBe('https://github.com/example/research-data/commit/commit-2');
    expect(fetchMock).toHaveBeenCalledTimes(run.pack.repoFiles.length + 6);
    const treeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/git/trees'));
    const paths = JSON.parse(treeCall![1].body).tree.map((entry: { path: string }) => entry.path);
    expect(paths).toContain('clinics/3f9a2c1d5e6b7a8c9d0e1f2a3b4c5d6e/latest.json');
    const commitCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/git/commits'));
    expect(JSON.parse(commitCall![1].body).message).toContain(run.runKey);
  });

  it('fails early when a file exceeds the github file size guard', async () => {
    const run = makeRunPackage();
    run.pack.repoFiles = [packFile('research_measurements.csv', 'x'.repeat(1_500_000))];
    await expect(service.putRun(run)).rejects.toThrow(BadRequestException);
  });

  it('mirrors only the manifest and change summary of a run stored elsewhere', async () => {
    const run = makeRunPackage();
    const fetchMock = commitResponses(2);

    const result = await service.mirrorManifest(run);

    expect(result.path).toBe(`clinics/${run.pack.manifest.clinicKey}/runs/${run.runKey}`);
    const treeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/git/trees'));
    const paths = JSON.parse(treeCall![1].body).tree.map((entry: { path: string }) => entry.path);
    expect(paths).toEqual([`${result.path}/changes.json`, `${result.path}/manifest.json`]);
  });

  it('is configured only when the owner, repository and token are all set', () => {
    expect(service.isConfigured()).toBe(true);
    delete process.env.RESEARCH_GITHUB_TOKEN;
    expect(service.isConfigured()).toBe(false);
  });

  describe('settling a push whose outcome was lost (#164)', () => {
    const pack = { manifest: { clinicKey: 'clinic-key', generatedAt: '2026-10-08T12:00:00.000Z' } };

    it('plans the same path the push uses', () => {
      expect(service.plannedPath({ exportId: 'exp-1', pack })).toBe(
        'clinics/clinic-key/exports/2026-10-08T12-00-00-000Z__exp-1',
      );
    });

    it('finds the commit that touched the snapshot directory on the export branch', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { sha: 'abc123', commit: { committer: { date: '2026-10-08T12:01:00Z' } } },
        ],
      });
      global.fetch = fetchMock as never;

      await expect(service.recoverRun('clinics/clinic-key/exports/snap')).resolves.toEqual({
        provider: 'GITHUB',
        path: 'clinics/clinic-key/exports/snap',
        ref: 'abc123',
        url: 'https://github.com/example/research-data/commit/abc123',
        syncedAt: new Date('2026-10-08T12:01:00Z'),
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('GET');
      expect(url).toBe(
        'https://api.github.com/repos/example/research-data/commits?sha=main&path=clinics%2Fclinic-key%2Fexports%2Fsnap&per_page=1',
      );
    });

    it('reports no commit when nothing touched the path', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      }) as never;
      await expect(service.recoverRun('clinics/clinic-key/exports/snap')).resolves.toBeNull();
    });

    it('throws when GitHub cannot be asked, rather than guessing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      }) as never;
      await expect(service.recoverRun('clinics/clinic-key/exports/snap')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
