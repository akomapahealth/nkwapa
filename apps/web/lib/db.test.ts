import { db } from './db';

describe('NkwapaDb medical history schema', () => {
  it('registers longitudinal record and revision stores without replacing existing stores', () => {
    const tableNames = db.tables.map((table) => table.name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'patients',
        'encounters',
        'outbox',
        'medical_history_records',
        'medical_history_revisions',
      ]),
    );
  });
});
