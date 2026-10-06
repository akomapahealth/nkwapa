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

/** A fetch that answers push with `pushResults` (one array per batch) and pull with `pull`. */
export function mockSyncFetch(
  pushResults: unknown[][] = [],
  pull: Record<string, unknown> = EMPTY_PULL,
) {
  const pushes = [...pushResults];
  const fetchMock = jest.fn(async (url: string) => {
    if (String(url).includes('/sync/push')) {
      return { ok: true, json: async () => ({ results: pushes.shift() ?? [] }) };
    }
    return { ok: true, json: async () => pull };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

export function pushBodies(fetchMock: jest.Mock): Array<Array<{ id: string }>> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes('/sync/push'))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

export function pulled(fetchMock: jest.Mock): boolean {
  return fetchMock.mock.calls.some(([url]) => String(url).includes('/sync/pull'));
}
