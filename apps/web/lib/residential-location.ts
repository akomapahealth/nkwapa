import { displayTimeZone } from '@/lib/ops';
import {
  DIGITAL_ADDRESS_EXAMPLE,
  GHANA_DISTRICTS_BY_REGION,
  GHANA_REGION_LABELS,
  GHANA_REGIONS,
  PATIENT_LOCATION_STATUS_LABELS,
  normalizeDigitalAddress,
  parsePosition,
} from '@nkwapa/db/ghana-locations';
import type { GhanaRegion, PatientLocationStatus, ResidentialPositionSource } from '@prisma/client';

export {
  DIGITAL_ADDRESS_EXAMPLE,
  GHANA_DISTRICTS_BY_REGION,
  GHANA_REGION_LABELS,
  GHANA_REGIONS,
  PATIENT_LOCATION_STATUS_LABELS,
  normalizeDigitalAddress,
  parsePosition,
};
export type { GhanaRegion, PatientLocationStatus, ResidentialPositionSource };

/** A recorded home position (#343). */
export interface ResidentialPosition {
  latitude: number;
  longitude: number;
  source: ResidentialPositionSource;
  /** Metres; only a device fix has one. */
  accuracyM: number | null;
  capturedAt: string;
}

export const DIGITAL_ADDRESS_ERROR = `Enter it like ${DIGITAL_ADDRESS_EXAMPLE}: two letters, the area code, then four digits.`;

export const POSITION_PARSE_ERRORS = {
  'no-coordinates':
    'No coordinates found. Paste a Google Maps link, or a latitude and longitude like 5.6037, -0.1870.',
  'short-link':
    'Short links hide the coordinates. Open the link, then copy the full address from the browser, or the numbers shown when you drop a pin.',
  'outside-ghana': 'That position is outside Ghana. Check the link or the numbers.',
} as const;

/** Form/edit state for a patient's residential location. */
export interface ResidentialLocationValue {
  residentialLocationStatus: PatientLocationStatus;
  residentialRegion: GhanaRegion | '';
  residentialDistrict: string;
  residentialCommunity: string;
  residentialAddressNote: string;
  residentialDigitalAddress: string;
  residentialLandmark: string;
  position: ResidentialPosition | null;
}

/** Status options in the order staff should read them. */
export const PATIENT_LOCATION_STATUS_OPTIONS: PatientLocationStatus[] = [
  'RECORDED',
  'UNKNOWN',
  'NOT_RECORDED',
];

/** A blank, deliberately not-recorded location for new intake forms. */
export function emptyResidentialLocation(): ResidentialLocationValue {
  return {
    residentialLocationStatus: 'NOT_RECORDED',
    residentialRegion: '',
    residentialDistrict: '',
    residentialCommunity: '',
    residentialAddressNote: '',
    residentialDigitalAddress: '',
    residentialLandmark: '',
    position: null,
  };
}

/** Districts available for a region (empty when no region is selected). */
export function districtsForRegion(region: GhanaRegion | ''): string[] {
  return region ? GHANA_DISTRICTS_BY_REGION[region] : [];
}

/** Residential columns as the API or the offline store returns them. Decimals arrive as strings. */
export type PatientLocationFields = {
  residentialLocationStatus?: PatientLocationStatus | string | null;
  residentialRegion?: GhanaRegion | string | null;
  residentialDistrict?: string | null;
  residentialCommunity?: string | null;
  residentialAddressNote?: string | null;
  residentialDigitalAddress?: string | null;
  residentialLandmark?: string | null;
  residentialLatitude?: number | string | null;
  residentialLongitude?: number | string | null;
  residentialPositionSource?: ResidentialPositionSource | string | null;
  residentialPositionAccuracyM?: number | null;
  residentialPositionCapturedAt?: string | null;
};

/** The stored position, or null when there is none (or half of one). */
export function positionFromPatient(
  patient: PatientLocationFields | null | undefined,
): ResidentialPosition | null {
  const latitude = Number(patient?.residentialLatitude ?? Number.NaN);
  const longitude = Number(patient?.residentialLongitude ?? Number.NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    source: patient?.residentialPositionSource === 'DEVICE' ? 'DEVICE' : 'PASTED',
    accuracyM: patient?.residentialPositionAccuracyM ?? null,
    capturedAt: patient?.residentialPositionCapturedAt ?? '',
  };
}

/** Opens Google Maps at the pin, in the browser or the Maps app. Nothing is sent until tapped. */
export function googleMapsUrl(position: Pick<ResidentialPosition, 'latitude' | 'longitude'>) {
  return `https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}`;
}

/** "5.603700, -0.187000": fixed width so a column of them lines up. */
export function formatPosition(position: Pick<ResidentialPosition, 'latitude' | 'longitude'>) {
  return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
}

/** The first problem that would make the server refuse this location, or null. */
export function residentialLocationError(value: ResidentialLocationValue): string | null {
  if (value.residentialLocationStatus !== 'RECORDED') return null;
  const address = value.residentialDigitalAddress.trim();
  if (address && !normalizeDigitalAddress(address)) {
    return `Ghana Digital Address: ${DIGITAL_ADDRESS_ERROR}`;
  }
  return null;
}

/** Hydrate edit-form state from a loaded patient record. */
export function toResidentialLocationValue(
  patient: PatientLocationFields | null | undefined,
): ResidentialLocationValue {
  if (!patient) {
    return emptyResidentialLocation();
  }
  return {
    residentialLocationStatus:
      (patient.residentialLocationStatus as PatientLocationStatus) ?? 'NOT_RECORDED',
    residentialRegion: (patient.residentialRegion as GhanaRegion) ?? '',
    residentialDistrict: patient.residentialDistrict ?? '',
    residentialCommunity: patient.residentialCommunity ?? '',
    residentialAddressNote: patient.residentialAddressNote ?? '',
    residentialDigitalAddress: patient.residentialDigitalAddress ?? '',
    residentialLandmark: patient.residentialLandmark ?? '',
    position: positionFromPatient(patient),
  };
}

/**
 * Normalize form state into an API payload. Mirrors the server invariant so the
 * request is already coherent: only RECORDED carries granular fields.
 */
export function toResidentialLocationPayload(value: ResidentialLocationValue): {
  residentialLocationStatus: PatientLocationStatus;
  residentialRegion: GhanaRegion | null;
  residentialDistrict: string | null;
  residentialCommunity: string | null;
  residentialAddressNote: string | null;
  residentialDigitalAddress: string | null;
  residentialLandmark: string | null;
  residentialLatitude: number | null;
  residentialLongitude: number | null;
  residentialPositionSource: ResidentialPositionSource | null;
  residentialPositionAccuracyM: number | null;
  residentialPositionCapturedAt: string | null;
} {
  if (value.residentialLocationStatus !== 'RECORDED') {
    return {
      residentialLocationStatus: value.residentialLocationStatus,
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
    };
  }
  const address = value.residentialDigitalAddress.trim();
  const position = value.position;
  return {
    residentialLocationStatus: 'RECORDED',
    residentialRegion: value.residentialRegion || null,
    residentialDistrict: value.residentialDistrict.trim() || null,
    residentialCommunity: value.residentialCommunity.trim() || null,
    residentialAddressNote: value.residentialAddressNote.trim() || null,
    residentialDigitalAddress: address ? (normalizeDigitalAddress(address) ?? address) : null,
    residentialLandmark: value.residentialLandmark.trim() || null,
    residentialLatitude: position?.latitude ?? null,
    residentialLongitude: position?.longitude ?? null,
    residentialPositionSource: position?.source ?? null,
    residentialPositionAccuracyM: position?.accuracyM ?? null,
    residentialPositionCapturedAt: position?.capturedAt || null,
  };
}

export interface ResidentialLocationDescription {
  status: PatientLocationStatus;
  statusLabel: string;
  isRecorded: boolean;
  regionLabel: string | null;
  district: string | null;
  community: string | null;
  addressNote: string | null;
  digitalAddress: string | null;
  landmark: string | null;
  position: ResidentialPosition | null;
  /** One-line summary, e.g. "Osu, Accra Metropolitan, Greater Accra". */
  summary: string;
}

/** Build a display-ready description for the patient detail page. */
export function describeResidentialLocation(
  patient: PatientLocationFields | null | undefined,
): ResidentialLocationDescription {
  const status = (patient?.residentialLocationStatus as PatientLocationStatus) ?? 'NOT_RECORDED';
  const statusLabel = PATIENT_LOCATION_STATUS_LABELS[status] ?? 'Not recorded';

  if (status !== 'RECORDED') {
    return {
      status,
      statusLabel,
      isRecorded: false,
      regionLabel: null,
      district: null,
      community: null,
      addressNote: null,
      digitalAddress: null,
      landmark: null,
      position: null,
      summary: statusLabel,
    };
  }

  const region = patient?.residentialRegion as GhanaRegion | undefined;
  const regionLabel = region ? (GHANA_REGION_LABELS[region] ?? null) : null;
  const district = patient?.residentialDistrict?.trim() || null;
  const community = patient?.residentialCommunity?.trim() || null;
  const addressNote = patient?.residentialAddressNote?.trim() || null;

  const summary = [community, district, regionLabel].filter(Boolean).join(', ') || statusLabel;

  return {
    status,
    statusLabel,
    isRecorded: true,
    regionLabel,
    district,
    community,
    addressNote,
    digitalAddress: patient?.residentialDigitalAddress?.trim() || null,
    landmark: patient?.residentialLandmark?.trim() || null,
    position: positionFromPatient(patient),
    summary,
  };
}

export const REGION_OPTIONS = GHANA_REGIONS.map((region) => ({
  value: region,
  label: GHANA_REGION_LABELS[region],
}));

const capturedAtFormat = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: displayTimeZone(),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** "This device, at a home visit · ±12 m · 15 Nov 2026, 10:04" */
export function describePositionCapture(position: ResidentialPosition): string {
  const parts = [
    position.source === 'DEVICE' ? 'This device, at a home visit' : 'Pasted from a shared location',
  ];
  if (position.accuracyM != null) parts.push(`±${position.accuracyM} m`);
  const when = position.capturedAt ? new Date(position.capturedAt) : null;
  if (when && !Number.isNaN(when.getTime())) parts.push(capturedAtFormat().format(when));
  return parts.join(' · ');
}
