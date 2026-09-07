import {
  getActiveBootstrapClinic,
  getBootstrapActiveClinicId,
  getSwitchableClinics,
  isStoredClinicIdValid,
} from '@/lib/bootstrap-clinics';

describe('bootstrap clinic helpers', () => {
  it('uses availableClinics as the switchable clinic contract for system admins', () => {
    const bootstrap = {
      activeClinicId: 'clinic-2',
      availableClinics: [
        { clinicId: 'clinic-1', clinicName: 'Clinic One' },
        { clinicId: 'clinic-2', clinicName: 'Clinic Two' },
      ],
      memberships: [],
    };

    expect(getSwitchableClinics(bootstrap)).toEqual([
      { clinicId: 'clinic-1', clinicName: 'Clinic One' },
      { clinicId: 'clinic-2', clinicName: 'Clinic Two' },
    ]);
    expect(getBootstrapActiveClinicId(bootstrap)).toBe('clinic-2');
    expect(getActiveBootstrapClinic(bootstrap)?.clinicName).toBe('Clinic Two');
    expect(isStoredClinicIdValid(bootstrap, 'clinic-1')).toBe(true);
  });

  it('falls back to explicit memberships for older bootstrap payloads', () => {
    const bootstrap = {
      activeClinicId: null,
      memberships: [
        { clinicId: 'clinic-3', clinicName: 'Clinic Three', roles: ['MANAGER'] },
        { clinicId: 'clinic-4', clinicName: 'Clinic Four', roles: ['VOLUNTEER'] },
      ],
    };

    // An older payload carries no zone, and the fallback settles it to null rather than leaving
    // the field absent, so a caller reading the zone gets "no zone" instead of undefined.
    expect(getSwitchableClinics(bootstrap)).toEqual([
      { clinicId: 'clinic-3', clinicName: 'Clinic Three', zoneCode: null },
      { clinicId: 'clinic-4', clinicName: 'Clinic Four', zoneCode: null },
    ]);
    expect(getBootstrapActiveClinicId(bootstrap)).toBe('clinic-3');
    expect(isStoredClinicIdValid(bootstrap, 'clinic-4')).toBe(true);
  });

  it('rejects stored clinic ids not returned by the server as switchable', () => {
    const bootstrap = {
      activeClinicId: 'clinic-1',
      availableClinics: [{ clinicId: 'clinic-1', clinicName: 'Clinic One' }],
      memberships: [],
    };

    expect(isStoredClinicIdValid(bootstrap, 'inactive-clinic')).toBe(false);
    expect(getActiveBootstrapClinic(bootstrap, 'inactive-clinic')).toBeNull();
  });
});
