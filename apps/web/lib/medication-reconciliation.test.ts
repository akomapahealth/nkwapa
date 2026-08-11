import {
  medicationListState,
  pharmacyAddress,
  sortMedicationRecords,
  type MedicationRecord,
} from './medication-reconciliation';

function record(status: 'CURRENT' | 'PAST' | 'STOPPED', updatedAt: string): MedicationRecord {
  return {
    id: `${status}-${updatedAt}`,
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    currentRevisionId: 'revision-1',
    recordedByUserId: 'user-1',
    createdAt: updatedAt,
    updatedAt,
    currentRevision: {
      id: 'revision-1',
      recordId: 'record-1',
      revisionNumber: 1,
      medicationName: status,
      status,
      sourceType: 'PATIENT_REPORTED',
      authoredByUserId: 'user-1',
      createdAt: updatedAt,
    },
  };
}

describe('medication reconciliation UI helpers', () => {
  it('distinguishes no records from an explicit no-known-current attestation', () => {
    expect(medicationListState([], null)).toBe('NOT_RECORDED');
    expect(
      medicationListState([], {
        id: 'event-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        outcome: 'NO_KNOWN_CURRENT_MEDICATIONS',
        reconciledByUserId: 'user-1',
        createdAt: '2026-08-11T12:00:00Z',
      }),
    ).toBe('NO_KNOWN_CURRENT_MEDICATIONS');
  });

  it('sorts current records ahead of past and stopped records', () => {
    const sorted = sortMedicationRecords([
      record('STOPPED', '2026-08-11T12:00:00Z'),
      record('CURRENT', '2026-08-10T12:00:00Z'),
      record('PAST', '2026-08-12T12:00:00Z'),
    ]);

    expect(sorted.map((item) => item.currentRevision.status)).toEqual([
      'CURRENT',
      'PAST',
      'STOPPED',
    ]);
  });

  it('uses structured address fields when free-form text is absent', () => {
    expect(
      pharmacyAddress({
        id: 'revision-1',
        recordId: 'record-1',
        revisionNumber: 1,
        name: 'Clinic Pharmacy',
        addressLine1: '1 Main Street',
        city: 'Accra',
        countryCode: 'GH',
        authoredByUserId: 'user-1',
        createdAt: '2026-08-11T12:00:00Z',
      }),
    ).toBe('1 Main Street, Accra, GH');
  });
});
