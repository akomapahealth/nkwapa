import {
  GHANA_DISTRICTS_BY_REGION,
  GHANA_REGION_LABELS,
  GHANA_REGIONS,
  PATIENT_LOCATION_STATUS_LABELS,
} from '@nkwapa/db';
import type { GhanaRegion, PatientLocationStatus } from '@prisma/client';

export {
  GHANA_DISTRICTS_BY_REGION,
  GHANA_REGION_LABELS,
  GHANA_REGIONS,
  PATIENT_LOCATION_STATUS_LABELS,
};
export type { GhanaRegion, PatientLocationStatus };

/** Form/edit state for a patient's residential location. */
export interface ResidentialLocationValue {
  residentialLocationStatus: PatientLocationStatus;
  residentialRegion: GhanaRegion | '';
  residentialDistrict: string;
  residentialCommunity: string;
  residentialAddressNote: string;
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
  };
}

/** Districts available for a region (empty when no region is selected). */
export function districtsForRegion(region: GhanaRegion | ''): string[] {
  return region ? GHANA_DISTRICTS_BY_REGION[region] : [];
}

type PatientLocationFields = {
  residentialLocationStatus?: PatientLocationStatus | string | null;
  residentialRegion?: GhanaRegion | string | null;
  residentialDistrict?: string | null;
  residentialCommunity?: string | null;
  residentialAddressNote?: string | null;
};

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
} {
  if (value.residentialLocationStatus !== 'RECORDED') {
    return {
      residentialLocationStatus: value.residentialLocationStatus,
      residentialRegion: null,
      residentialDistrict: null,
      residentialCommunity: null,
      residentialAddressNote: null,
    };
  }
  return {
    residentialLocationStatus: 'RECORDED',
    residentialRegion: value.residentialRegion || null,
    residentialDistrict: value.residentialDistrict.trim() || null,
    residentialCommunity: value.residentialCommunity.trim() || null,
    residentialAddressNote: value.residentialAddressNote.trim() || null,
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
    summary,
  };
}

export const REGION_OPTIONS = GHANA_REGIONS.map((region) => ({
  value: region,
  label: GHANA_REGION_LABELS[region],
}));
