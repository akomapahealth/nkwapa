import { claimEncounterRecord, type EncounterScopedRecord } from './encounter-record';

function fakeTable(rows: EncounterScopedRecord[]) {
  const deleted: string[] = [];
  return {
    deleted,
    rows,
    table: {
      where: () => ({ equals: () => ({ toArray: async () => rows }) }),
      bulkDelete: async (ids: string[]) => {
        deleted.push(...ids);
        return undefined;
      },
    },
  };
}

const NEW_ID = 'generated-id';
const generate = () => NEW_ID;

describe('claimEncounterRecord', () => {
  it('generates an id when the encounter has no record yet', async () => {
    const { table, deleted } = fakeTable([]);
    expect(await claimEncounterRecord(table, 'enc-1', generate)).toEqual({
      id: NEW_ID,
      removedDuplicates: 0,
    });
    expect(deleted).toEqual([]);
  });

  it('reuses the existing id so a second save updates instead of inserting', async () => {
    // The defect in #91: without this, every save drew a fresh UUID and left another row behind.
    const { table, deleted } = fakeTable([
      { id: 'aaa', encounterId: 'enc-1', createdAt: 'T0', updatedAt: 'T1' },
    ]);
    expect(await claimEncounterRecord(table, 'enc-1', generate)).toEqual({
      id: 'aaa',
      createdAt: 'T0',
      removedDuplicates: 0,
    });
    expect(deleted).toEqual([]);
  });

  it('keeps the most recently updated row, not the one UUID ordering happens to surface', async () => {
    /*
      The heart of the bug. `.first()` returns the lowest primary key, so with these rows the
      encounter page showed 'aaa' -- the OLDEST save -- while the newest data sat in 'zzz'.
    */
    const { table, deleted } = fakeTable([
      { id: 'zzz', encounterId: 'enc-1', createdAt: 'T2', updatedAt: 'T9' },
      { id: 'aaa', encounterId: 'enc-1', createdAt: 'T0', updatedAt: 'T1' },
      { id: 'mmm', encounterId: 'enc-1', createdAt: 'T1', updatedAt: 'T5' },
    ]);
    expect(await claimEncounterRecord(table, 'enc-1', generate)).toEqual({
      id: 'zzz',
      createdAt: 'T2',
      removedDuplicates: 2,
    });
    expect(deleted.sort()).toEqual(['aaa', 'mmm']);
  });

  it('converges on the row a sync pull brought back from the server', async () => {
    /*
      After a push the server upserts by encounterId and returns its own row, which the pull
      writes under the server's id. That row carries the freshest updatedAt, so it wins here and
      the client-generated orphan is collapsed into it. Keeping the lowest id instead would
      strand an id the server has never heard of.
    */
    const { table, deleted } = fakeTable([
      { id: 'client-generated', encounterId: 'enc-1', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'server-row', encounterId: 'enc-1', updatedAt: '2026-01-01T00:00:05Z' },
    ]);
    const claimed = await claimEncounterRecord(table, 'enc-1', generate);
    expect(claimed.id).toBe('server-row');
    expect(deleted).toEqual(['client-generated']);
  });

  it('falls back to the lowest id when nothing carries an updatedAt', async () => {
    const { table } = fakeTable([
      { id: 'bbb', encounterId: 'enc-1' },
      { id: 'aaa', encounterId: 'enc-1' },
    ]);
    expect((await claimEncounterRecord(table, 'enc-1', generate)).id).toBe('aaa');
  });

  it('never invents an id when one already exists', async () => {
    const { table } = fakeTable([{ id: 'existing', encounterId: 'enc-1' }]);
    const claimed = await claimEncounterRecord(table, 'enc-1', () => {
      throw new Error('generateId must not be called when a record exists');
    });
    expect(claimed.id).toBe('existing');
  });
});
