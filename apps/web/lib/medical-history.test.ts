import {
  medicalHistoryLabel,
  requiresPrescriptionAllergyAcknowledgement,
  sortMedicalHistory,
  type MedicalHistoryRecord,
} from './medical-history';

function record(
  id: string,
  status: MedicalHistoryRecord['currentRevision']['status'],
  updatedAt: string,
): MedicalHistoryRecord {
  return {
    id,
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    category: 'CONDITION',
    currentRevisionId: `${id}-revision`,
    currentRevision: {
      id: `${id}-revision`,
      recordId: id,
      revisionNumber: 1,
      status,
      detailsSchemaVersion: 1,
      details: { conditionName: id },
      authoredByUserId: 'user-1',
      createdAt: updatedAt,
    },
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('medical history UI helpers', () => {
  it('orders active records first and then newest history', () => {
    const result = sortMedicalHistory([
      record('resolved-new', 'RESOLVED', '2026-07-30T12:00:00Z'),
      record('active-old', 'ACTIVE', '2026-01-01T12:00:00Z'),
      record('historical-old', 'HISTORICAL', '2025-01-01T12:00:00Z'),
    ]);

    expect(result.map((item) => item.id)).toEqual(['active-old', 'resolved-new', 'historical-old']);
  });

  it('uses explicit NKA language', () => {
    const nka = {
      ...record('nka', 'ACTIVE', '2026-07-30T12:00:00Z'),
      category: 'ALLERGY' as const,
    };
    nka.currentRevision.details = { kind: 'NO_KNOWN_ALLERGIES' };

    expect(medicalHistoryLabel(nka)).toBe('No known allergies');
  });

  it('requires prescription acknowledgement only for active or unknown allergy state', () => {
    expect(requiresPrescriptionAllergyAcknowledgement('ACTIVE_ALLERGIES')).toBe(true);
    expect(requiresPrescriptionAllergyAcknowledgement('NOT_RECORDED')).toBe(true);
    expect(requiresPrescriptionAllergyAcknowledgement('UNAVAILABLE')).toBe(true);
    expect(requiresPrescriptionAllergyAcknowledgement('NO_KNOWN_ALLERGIES')).toBe(false);
    expect(requiresPrescriptionAllergyAcknowledgement('HISTORICAL_ONLY')).toBe(false);
  });
});
