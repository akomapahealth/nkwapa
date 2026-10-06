/**
 * An in-memory stand-in for the Dexie tables the sync engine touches.
 *
 * Only the calls sync.ts makes are implemented, and each behaves like Dexie's: `update` merges,
 * `bulkPut` replaces by primary key, and `where(index).equals(value)` filters on a field. Tests
 * that mocked each call separately could not tell whether a refused row was actually persisted.
 */

type Row = Record<string, unknown> & { id?: string; clinicId?: string };

export class FakeTable<T extends Row = Row> {
  readonly rows = new Map<string, T>();

  constructor(private readonly key: keyof T & string = 'id') {}

  private keyOf(row: T): string {
    return String(row[this.key]);
  }

  async get(id: string) {
    return this.rows.get(id);
  }

  async put(row: T) {
    this.rows.set(this.keyOf(row), row);
  }

  async bulkPut(rows: T[]) {
    rows.forEach((row) => this.rows.set(this.keyOf(row), row));
  }

  async add(row: T) {
    this.rows.set(this.keyOf(row), row);
  }

  async update(id: string, changes: Partial<T>) {
    const row = this.rows.get(id);
    if (!row) return 0;
    this.rows.set(id, { ...row, ...changes });
    return 1;
  }

  async delete(id: string) {
    this.rows.delete(id);
  }

  async bulkDelete(ids: string[]) {
    ids.forEach((id) => this.rows.delete(id));
  }

  async clear() {
    this.rows.clear();
  }

  async toArray() {
    return [...this.rows.values()];
  }

  where(field: keyof T & string) {
    const matching = (value: unknown) =>
      [...this.rows.values()].filter((row) => row[field] === value);
    return {
      equals: (value: unknown) => ({
        toArray: async () => matching(value),
        first: async () => matching(value)[0],
        count: async () => matching(value).length,
        sortBy: async (sortField: keyof T & string) =>
          matching(value).sort((a, b) => String(a[sortField]).localeCompare(String(b[sortField]))),
      }),
    };
  }
}

const TABLES = [
  'outbox',
  'patients',
  'encounters',
  'vitals',
  'tobacco_screenings',
  'diabetes_screenings',
  'hypertension_assessments',
  'medication_adherence',
  'care_plans',
  'patient_consents',
  'prescriptions',
  'medical_history_records',
  'medical_history_revisions',
  'patient_medication_records',
  'patient_medication_revisions',
  'medication_reconciliation_events',
  'patient_pharmacy_records',
  'patient_pharmacy_revisions',
  'patient_pharmacy_preferences',
] as const;

type TableName = (typeof TABLES)[number] | 'sync_state' | 'ops_cache' | 'portal_cache';

export type FakeSyncDb = Record<TableName, FakeTable> & {
  table: (name: string) => FakeTable;
};

export function createFakeSyncDb(): FakeSyncDb {
  const tables = Object.fromEntries(TABLES.map((name) => [name, new FakeTable()])) as Record<
    TableName,
    FakeTable
  >;
  tables.sync_state = new FakeTable('clinicId');
  tables.ops_cache = new FakeTable('key');
  tables.portal_cache = new FakeTable('key');
  return {
    ...tables,
    table: (name: string) => {
      const table = tables[name as TableName];
      if (!table) throw new Error(`No fake table ${name}`);
      return table;
    },
  };
}

export function reset(db: FakeSyncDb) {
  Object.values(db).forEach((table) => {
    if (table instanceof FakeTable) table.rows.clear();
  });
}

export const EMPTY_PULL = {
  cursor: 'cursor-1',
  patients: [],
  mergedPatients: [],
  encounters: [],
  vitals: [],
  tobaccoScreenings: [],
  diabetesScreenings: [],
  hypertensionAssessments: [],
  carePlans: [],
  patientConsents: [],
  prescriptions: [],
  medicalHistoryRecords: [],
  medicalHistoryRevisions: [],
  patientMedicationRecords: [],
  patientMedicationRevisions: [],
  medicationReconciliationEvents: [],
  patientPharmacyRecords: [],
  patientPharmacyRevisions: [],
  patientPharmacyPreferences: [],
};

export function queuedRow(overrides: Row = {}) {
  return {
    id: 'mutation-1',
    clinicId: 'clinic-1',
    entityType: 'encounter_vitals_bundle',
    entityId: 'vitals-1',
    operation: 'UPSERT',
    payloadJson: JSON.stringify({ encounterId: 'encounter-1' }),
    idempotencyKey: 'idempotency-1',
    createdAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

/**
 * One answer from the network, as the sync engine meets it.
 *
 * - an array: a push that the server answered with these per-row results
 * - `{ status }`: a request that reached the server and was refused as a whole
 * - `'unreachable'`: a fetch that rejects, as it does offline
 * - `'stall'`: a fetch that never settles until its signal aborts, as clinic wifi that resolves DNS
 *   and then hangs does
 */
export type NetworkAnswer = unknown[] | NetworkRefusal | 'unreachable' | 'stall';

interface NetworkRefusal {
  status: number;
  body?: string;
}

/** A pull body always carries a cursor; a refusal never does. */
function isRefusal(step: object): step is NetworkRefusal {
  return 'status' in step && !('cursor' in step);
}

function answer(step: NetworkAnswer | Record<string, unknown>, init?: RequestInit) {
  if (step === 'unreachable') return Promise.reject(new TypeError('Failed to fetch'));
  if (step === 'stall') {
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    });
  }
  if (Array.isArray(step)) {
    return Promise.resolve({ ok: true, json: async () => ({ results: step }) });
  }
  if (isRefusal(step)) {
    return Promise.resolve({ ok: false, status: step.status, text: async () => step.body ?? '' });
  }
  return Promise.resolve({ ok: true, json: async () => step });
}

/**
 * A fetch that plays a script: each push takes the next of `push`, each pull the next of `pull`.
 * Once a script runs out, a push answers with no results and a pull with `everyPull`, so a test
 * only spells out the calls it cares about.
 */
export function mockSyncNetwork(
  script: {
    push?: NetworkAnswer[];
    pull?: Array<NetworkAnswer | Record<string, unknown>>;
    everyPull?: Record<string, unknown>;
  } = {},
) {
  const pushes = [...(script.push ?? [])];
  const pulls = [...(script.pull ?? [])];
  const everyPull = script.everyPull ?? EMPTY_PULL;
  const fetchMock = jest.fn((url: string, init?: RequestInit) =>
    String(url).includes('/sync/push')
      ? answer(pushes.shift() ?? [], init)
      : answer(pulls.shift() ?? everyPull, init),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** A fetch that answers push with `pushResults` (one array per batch) and pull with `pull`. */
export function mockSyncFetch(
  pushResults: unknown[][] = [],
  pull: Record<string, unknown> = EMPTY_PULL,
) {
  return mockSyncNetwork({ push: pushResults, everyPull: pull });
}

export function pushBodies(fetchMock: jest.Mock): Array<Array<{ id: string }>> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes('/sync/push'))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

export function pulled(fetchMock: jest.Mock): boolean {
  return fetchMock.mock.calls.some(([url]) => String(url).includes('/sync/pull'));
}
