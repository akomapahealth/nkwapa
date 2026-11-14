import {
  medicalHistoryDetail,
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

  it('puts an active allergy above a newer active condition', () => {
    const allergy = {
      ...record('allergy', 'ACTIVE', '2026-01-01T12:00:00Z'),
      category: 'ALLERGY' as const,
    };
    const result = sortMedicalHistory([
      record('condition', 'ACTIVE', '2026-07-30T12:00:00Z'),
      allergy,
    ]);

    expect(result.map((item) => item.id)).toEqual(['allergy', 'condition']);
  });

  it('reads social history and allergy details in plain words', () => {
    const social = {
      ...record('s', 'ACTIVE', '2026-07-30T12:00:00Z'),
      category: 'SOCIAL_HISTORY' as const,
    };
    social.currentRevision.details = { socialType: 'TOBACCO', description: 'Stopped in 2020' };
    const allergy = {
      ...record('a', 'ACTIVE', '2026-07-30T12:00:00Z'),
      category: 'ALLERGY' as const,
    };
    allergy.currentRevision.details = {
      kind: 'ALLERGY',
      substance: 'Penicillin',
      severity: 'SEVERE',
      reaction: 'Rash',
    };
    const condition = record('c', 'RESOLVED', '2026-07-30T12:00:00Z');
    condition.currentRevision.onsetDate = '2019-03-01';
    condition.currentRevision.resolvedDate = '2021-05-31T00:00:00.000Z';

    expect(medicalHistoryLabel(social)).toBe('Tobacco use');
    expect(medicalHistoryDetail(social)).toBe('Stopped in 2020');
    expect(medicalHistoryDetail(allergy)).toBe('Severe · Rash');
    expect(medicalHistoryDetail(condition)).toBe('Since Mar 1, 2019 · Resolved May 31, 2021');
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
