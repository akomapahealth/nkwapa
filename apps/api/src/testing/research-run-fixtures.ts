import type { ResearchExportStatus } from '@prisma/client';
import { ResearchExportService } from '../research/research-export.service';
import type { ResearchExportRecord } from '../research/research-export.repository';
import {
  sha256Hex,
  type GeneratedResearchPack,
  type ResearchPackFile,
} from '../research/research-policy';
import type { ResearchRunPackage, StoredRunRef } from '../research/storage/research-storage.port';

/** A pack file with its real size and hash, for storage specs. */
export function packFile(name: string, content: string): ResearchPackFile {
  return { name, content, bytes: Buffer.byteLength(content), sha256: sha256Hex(content) };
}

/** A small but complete run: two tables, changes, manifest and checksums. */
export function makeRunPackage(overrides: Partial<ResearchRunPackage> = {}): ResearchRunPackage {
  const runKey = overrides.runKey ?? 'rx-3f9a2c1d-m2026-10';
  const tables = [
    packFile('research_subjects.csv', 'research_patient_key,sex\nab12,F\n'),
    packFile('research_revocations.csv', 'research_patient_key,revoked_at\n'),
  ];
  const changes = {
    runKey,
    previousRunKey: null,
    consentedSubjects: 1,
    previousConsentedSubjects: null,
    subjectsAdded: 1,
    subjectsRevoked: 0,
    subjectsOtherwiseRemoved: 0,
    rowCountDeltas: { research_subjects: 1, research_revocations: 0 },
  };
  const manifest: GeneratedResearchPack['manifest'] = {
    exportId: 'export-1',
    runKey,
    trigger: 'SCHEDULED',
    scheduleId: null,
    previousRunKey: null,
    clinicKey: '3f9a2c1d5e6b7a8c9d0e1f2a3b4c5d6e',
    hmacKeyId: 'research-hmac-v1',
    consentedSubjects: 1,
    revokedSinceLast: 0,
    contentSha256: 'c'.repeat(64),
    datasetVersion: 5,
    policyVersion: 'research-export-v1',
    fromDate: '2026-01-01',
    toDate: '2026-09-30',
    generatedAt: '2026-10-01T03:00:12.000Z',
    timestampRoundingMinutes: 15,
    rowCounts: { research_subjects: 1, research_revocations: 0 },
    files: tables.map((file) => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })),
  };
  const changesFile = packFile('changes.json', `${JSON.stringify(changes, null, 2)}\n`);
  const manifestFile = packFile('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const sums = packFile(
    'SHA256SUMS.txt',
    [...tables, changesFile, manifestFile].map((f) => `${f.sha256}  ${f.name}`).join('\n') + '\n',
  );
  return {
    exportId: 'export-1',
    runKey,
    fromDate: '2026-01-01',
    toDate: '2026-09-30',
    pack: {
      manifest,
      changes,
      repoFiles: [...tables, changesFile, manifestFile, sums],
      artifactPath: '/tmp/research-export-export-1.zip',
      artifactSha256: 'a'.repeat(64),
      artifactSizeBytes: 512,
      recordCount: 1,
      rowCounts: manifest.rowCounts,
    },
    ...overrides,
  };
}

/** A full export row as the repository returns it, for service specs. */
export function makeExportRecord(
  overrides: Partial<ResearchExportRecord> = {},
): ResearchExportRecord {
  return {
    id: 'exp-1',
    clinicId: 'clinic-1',
    runKey: 'rx-3f9a2c1d-a20260321-k3m2',
    trigger: 'MANUAL',
    scheduleId: null,
    requestedByUserId: 'user-1',
    approvedByUserId: null,
    fromDate: '2026-03-01',
    toDate: '2026-03-21',
    status: 'PENDING_APPROVAL' as ResearchExportStatus,
    datasetVersion: 5,
    policyVersionSnapshot: 'research-export-v1',
    rejectionReason: null,
    failureReason: null,
    skipReason: null,
    filePath: null,
    fileFormat: 'zip',
    recordCount: null,
    rowCountsJson: null,
    consentedSubjectCount: null,
    revokedSinceLastCount: null,
    contentSha256: null,
    changesJson: null,
    artifactSha256: null,
    artifactSizeBytes: null,
    storageProvider: 'GITHUB',
    storagePath: null,
    storageRef: null,
    storageUrl: null,
    syncedAt: null,
    requestedAt: new Date('2026-03-21T12:00:00.000Z'),
    startedAt: null,
    approvedAt: null,
    completedAt: null,
    requestedBy: { id: 'user-1', displayName: 'Requester' },
    approvedBy: null,
    ...overrides,
  };
}

/** A storage adapter whose every call is a mock, publishing to `path`. */
export function mockStorageAdapter(path = 'research/v5/clinic=key/runs/rx-key-m2026-09') {
  return {
    provider: 'LOCAL' as const,
    isConfigured: jest.fn(() => true),
    plannedPath: jest.fn(() => path),
    putRun: jest.fn(
      async (): Promise<StoredRunRef> => ({
        provider: 'LOCAL',
        path,
        ref: 'content-sha',
        url: `file:///${path}/`,
        syncedAt: new Date('2026-10-08T12:01:00Z'),
      }),
    ),
    recoverRun: jest.fn(async (): Promise<StoredRunRef | null> => null),
  };
}

/**
 * A ResearchExportService over plain mocks. Every collaborator can be replaced; the defaults
 * describe a clinic with research on, plenty of consented subjects, and a working queue.
 */
export function buildResearchExportService(overrides: Partial<ResearchServiceDeps> = {}) {
  const adapter = overrides.adapter ?? mockStorageAdapter();
  const deps: ResearchServiceDeps = {
    repo: {
      create: jest.fn(),
      findById: jest.fn(),
      findByRunKey: jest.fn(),
      update: jest.fn(),
      transition: jest.fn(),
      findStaleProcessing: jest.fn().mockResolvedValue([]),
      listByClinic: jest.fn(),
      listRunKeysWithPrefix: jest.fn().mockResolvedValue([]),
      consentedPatientIds: jest
        .fn()
        .mockResolvedValue(Array.from({ length: 12 }, (_, index) => `p${index}`)),
    },
    prisma: {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      $executeRaw: jest.fn().mockResolvedValue(0),
      clinicResearchSettings: {
        findUnique: jest.fn().mockResolvedValue({ researchEnabled: true }),
      },
      researchExportSchedule: { findUnique: jest.fn().mockResolvedValue(null) },
      clinic: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Accra' }) },
    },
    audit: { logWrite: jest.fn().mockResolvedValue(undefined) },
    transformService: { generatePack: jest.fn() },
    adapter,
    storage: {
      get: jest.fn(() => adapter),
      defaultProvider: jest.fn(() => adapter.provider),
      assertAvailable: jest.fn(),
      mirrorsManifests: jest.fn(() => false),
      github: { mirrorManifest: jest.fn() },
    },
    deIdService: { clinicKey: jest.fn(() => '3f9a2c1d5e6b7a8c9d0e1f2a3b4c5d6e') },
    notifier: { notifyDirectors: jest.fn().mockResolvedValue(1) },
    queue: { add: jest.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
  const service = new ResearchExportService(
    deps.repo as never,
    deps.prisma as never,
    deps.audit as never,
    deps.transformService as never,
    deps.storage as never,
    deps.deIdService as never,
    deps.notifier as never,
    deps.queue as never,
    { isReady: () => true, assertReady: () => undefined } as never,
  );
  return { service, ...deps };
}

export interface ResearchServiceDeps {
  repo: Record<string, jest.Mock>;
  prisma: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    clinicResearchSettings: { findUnique: jest.Mock };
    researchExportSchedule: { findUnique: jest.Mock };
    clinic: { findUnique: jest.Mock };
  };
  audit: { logWrite: jest.Mock };
  transformService: { generatePack: jest.Mock };
  adapter: ReturnType<typeof mockStorageAdapter>;
  storage: {
    get: jest.Mock;
    defaultProvider: jest.Mock;
    assertAvailable: jest.Mock;
    mirrorsManifests: jest.Mock;
    github: { mirrorManifest: jest.Mock };
  };
  deIdService: { clinicKey: jest.Mock };
  notifier: { notifyDirectors: jest.Mock };
  queue: { add: jest.Mock };
}

/** The audit actions written, in order. */
export const auditActions = (audit: { logWrite: jest.Mock }) =>
  audit.logWrite.mock.calls.map(([event]) => (event as { action: string }).action);
