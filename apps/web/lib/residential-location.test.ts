import {
  describePositionCapture,
  describeResidentialLocation,
  googleMapsUrl,
  residentialLocationError,
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
      residentialDigitalAddress: 'GA-183-8164',
      residentialLandmark: 'Blue kiosk',
      position: {
        latitude: 6.7,
        longitude: -1.6,
        source: 'PASTED',
        accuracyM: null,
        capturedAt: '2026-11-15T10:00:00.000Z',
      },
    });
    expect(payload).toEqual({
      residentialLocationStatus: 'UNKNOWN',
      residentialRegion: null,
      residentialDistrict: null,
      residentialCommunity: null,
      residentialAddressNote: null,
      residentialDigitalAddress: null,
      residentialLandmark: null,
      residentialLatitude: null,
      residentialLongitude: null,
      residentialPositionSource: null,
      residentialPositionAccuracyM: null,
      residentialPositionCapturedAt: null,
    });
  });

  it('trims and forwards recorded fields', () => {
    const payload = toResidentialLocationPayload({
      residentialLocationStatus: 'RECORDED',
      residentialRegion: 'GREATER_ACCRA',
      residentialDistrict: 'Accra Metropolitan',
      residentialCommunity: '  Osu  ',
      residentialAddressNote: '',
      residentialDigitalAddress: ' ga1838164 ',
      residentialLandmark: '  Opposite the Methodist church ',
      position: null,
    });
    expect(payload.residentialRegion).toBe('GREATER_ACCRA');
    expect(payload.residentialCommunity).toBe('Osu');
    expect(payload.residentialAddressNote).toBeNull();
    expect(payload.residentialDigitalAddress).toBe('GA-183-8164');
    expect(payload.residentialLandmark).toBe('Opposite the Methodist church');
    expect(payload.residentialLatitude).toBeNull();
  });

  it('reads a stored position whose decimals arrive as strings', () => {
    const value = toResidentialLocationValue({
      residentialLocationStatus: 'RECORDED',
      residentialRegion: 'GREATER_ACCRA',
      residentialLatitude: '5.603700',
      residentialLongitude: '-0.187000',
      residentialPositionSource: 'DEVICE',
      residentialPositionAccuracyM: 12,
      residentialPositionCapturedAt: '2026-11-15T10:04:00.000Z',
    });
    expect(value.position).toEqual({
      latitude: 5.6037,
      longitude: -0.187,
      source: 'DEVICE',
      accuracyM: 12,
      capturedAt: '2026-11-15T10:04:00.000Z',
    });
    expect(describePositionCapture(value.position!)).toBe(
      'This device, at a home visit · ±12 m · 15 Nov 2026, 10:04',
    );
    expect(googleMapsUrl(value.position!)).toBe(
      'https://www.google.com/maps/search/?api=1&query=5.6037,-0.187',
    );
    // Half a position is no position.
    expect(toResidentialLocationValue({ residentialLatitude: '5.6' }).position).toBeNull();
  });

  it('round-trips a stored location unchanged, so an untouched edit sends nothing', () => {
    const stored = {
      residentialLocationStatus: 'RECORDED',
      residentialRegion: 'GREATER_ACCRA',
      residentialDigitalAddress: 'GA-183-8164',
      residentialLatitude: '5.603700',
      residentialLongitude: '-0.187000',
      residentialPositionSource: 'PASTED',
      residentialPositionCapturedAt: '2026-11-15T10:04:00.000Z',
    };
    const once = toResidentialLocationPayload(toResidentialLocationValue(stored));
    expect(toResidentialLocationPayload(toResidentialLocationValue({ ...once }))).toEqual(once);
  });

  it('blocks a malformed Digital Address before it is queued', () => {
    const value = { ...emptyResidentialLocation(), residentialLocationStatus: 'RECORDED' as const };
    expect(residentialLocationError({ ...value, residentialDigitalAddress: '12345' })).toContain(
      'GA-183-8164',
    );
    expect(
      residentialLocationError({ ...value, residentialDigitalAddress: 'ga1838164' }),
    ).toBeNull();
    expect(
      residentialLocationError({
        ...value,
        residentialLocationStatus: 'UNKNOWN',
        residentialDigitalAddress: '1',
      }),
    ).toBeNull();
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
