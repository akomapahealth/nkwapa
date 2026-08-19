import {
  describeResidentialLocation,
  districtsForRegion,
  emptyResidentialLocation,
  toResidentialLocationPayload,
  toResidentialLocationValue,
} from './residential-location';

describe('residential location web helpers', () => {
  it('defaults to a deliberately not-recorded location', () => {
    expect(emptyResidentialLocation().residentialLocationStatus).toBe('NOT_RECORDED');
  });

  it('lists districts for a region and nothing without one', () => {
    expect(districtsForRegion('GREATER_ACCRA')).toContain('Accra Metropolitan');
    expect(districtsForRegion('')).toEqual([]);
  });

  it('strips granular fields from the payload when not recorded', () => {
    const payload = toResidentialLocationPayload({
      residentialLocationStatus: 'UNKNOWN',
      residentialRegion: 'ASHANTI',
      residentialDistrict: 'Bekwai',
      residentialCommunity: 'Somewhere',
      residentialAddressNote: 'note',
    });
    expect(payload).toEqual({
      residentialLocationStatus: 'UNKNOWN',
      residentialRegion: null,
      residentialDistrict: null,
      residentialCommunity: null,
      residentialAddressNote: null,
    });
  });

  it('trims and forwards recorded fields', () => {
    const payload = toResidentialLocationPayload({
      residentialLocationStatus: 'RECORDED',
      residentialRegion: 'GREATER_ACCRA',
      residentialDistrict: 'Accra Metropolitan',
      residentialCommunity: '  Osu  ',
      residentialAddressNote: '',
    });
    expect(payload.residentialRegion).toBe('GREATER_ACCRA');
    expect(payload.residentialCommunity).toBe('Osu');
    expect(payload.residentialAddressNote).toBeNull();
  });

  it('round-trips a patient record into edit-form state', () => {
    const value = toResidentialLocationValue({
      residentialLocationStatus: 'RECORDED',
      residentialRegion: 'VOLTA',
      residentialDistrict: 'Ho Municipal',
      residentialCommunity: null,
      residentialAddressNote: null,
    });
    expect(value.residentialRegion).toBe('VOLTA');
    expect(value.residentialDistrict).toBe('Ho Municipal');
    expect(value.residentialCommunity).toBe('');
  });

  it('describes a recorded location as a readable summary', () => {
    const described = describeResidentialLocation({
      residentialLocationStatus: 'RECORDED',
      residentialRegion: 'GREATER_ACCRA',
      residentialDistrict: 'Accra Metropolitan',
      residentialCommunity: 'Osu',
    });
    expect(described.isRecorded).toBe(true);
    expect(described.summary).toBe('Osu, Accra Metropolitan, Greater Accra');
  });

  it('describes an unknown location by its status only', () => {
    const described = describeResidentialLocation({ residentialLocationStatus: 'UNKNOWN' });
    expect(described.isRecorded).toBe(false);
    expect(described.summary).toBe('Unknown');
  });
});
