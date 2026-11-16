import { BadRequestException } from '@nestjs/common';
import {
  DIGITAL_ADDRESS_EXAMPLE,
  isInGhana,
  normalizeDigitalAddress,
  normalizeDistrict,
} from '@nkwapa/db';
import { GhanaRegion, PatientLocationStatus, ResidentialPositionSource } from '@prisma/client';
import type { ResidentialDetailFilter } from './patient.repository';

/** Raw residential location fields as supplied by create/update/sync payloads. */
export interface ResidentialLocationInput {
  residentialLocationStatus?: PatientLocationStatus;
  residentialRegion?: GhanaRegion;
  residentialDistrict?: string;
  residentialCommunity?: string;
  residentialAddressNote?: string;
  residentialDigitalAddress?: string | null;
  residentialLandmark?: string | null;
  residentialLatitude?: number | null;
  residentialLongitude?: number | null;
  residentialPositionSource?: ResidentialPositionSource | null;
  residentialPositionAccuracyM?: number | null;
  residentialPositionCapturedAt?: string | Date | null;
}

/**
 * The fields added by #343. Undefined means "not sent": a client that predates them (or an
 * outbox item queued before the deploy) leaves what is stored, rather than clearing it.
 */
interface ResolvedResidentialDetail {
  residentialDigitalAddress?: string | null;
  residentialLandmark?: string | null;
  residentialLatitude?: number | null;
  residentialLongitude?: number | null;
  residentialPositionSource?: ResidentialPositionSource | null;
  residentialPositionAccuracyM?: number | null;
  residentialPositionCapturedAt?: Date | null;
}

/** Resolved residential location, ready to persist. */
export interface ResolvedResidentialLocation extends ResolvedResidentialDetail {
  residentialLocationStatus: PatientLocationStatus;
  residentialRegion: GhanaRegion | null;
  residentialDistrict: string | null;
  residentialCommunity: string | null;
  residentialAddressNote: string | null;
}

/** Optional residential location filters for the registry, within clinic scope. */
export interface ResidentialLocationFilters {
  residentialRegion?: GhanaRegion;
  residentialDistrict?: string;
  residentialCommunity?: string;
  residentialLocationStatus?: PatientLocationStatus;
  residentialDetail?: ResidentialDetailFilter;
}

const CLEARED_DETAIL: Required<ResolvedResidentialDetail> = {
  residentialDigitalAddress: null,
  residentialLandmark: null,
  residentialLatitude: null,
  residentialLongitude: null,
  residentialPositionSource: null,
  residentialPositionAccuracyM: null,
  residentialPositionCapturedAt: null,
};

/**
 * Enforce the deliberate residential-location invariant so a missing location is
 * never ambiguous blank text. Shared by the patient service and the offline
 * sync path so both persist an identical, consistent shape:
 * - RECORDED requires a region (district is normalized to its canonical name);
 * - UNKNOWN / NOT_RECORDED clear every granular field, including the position;
 * - an omitted status is inferred: RECORDED when a region is present, otherwise
 *   NOT_RECORDED.
 */
export function resolveResidentialLocation(
  input: ResidentialLocationInput,
): ResolvedResidentialLocation {
  const region = input.residentialRegion ?? null;
  const status: PatientLocationStatus =
    input.residentialLocationStatus ?? (region ? 'RECORDED' : 'NOT_RECORDED');

  if (status !== 'RECORDED') {
    return {
      residentialLocationStatus: status,
      residentialRegion: null,
      residentialDistrict: null,
      residentialCommunity: null,
      residentialAddressNote: null,
      ...CLEARED_DETAIL,
    };
  }

  if (!region) {
    throw new BadRequestException(
      'residentialRegion is required when residentialLocationStatus is RECORDED',
    );
  }

  return {
    residentialLocationStatus: 'RECORDED',
    residentialRegion: region,
    residentialDistrict: normalizeDistrict(region, input.residentialDistrict),
    residentialCommunity: input.residentialCommunity?.trim() || null,
    residentialAddressNote: input.residentialAddressNote?.trim() || null,
    ...resolveDigitalAddress(input.residentialDigitalAddress),
    ...(input.residentialLandmark !== undefined
      ? { residentialLandmark: input.residentialLandmark?.trim() || null }
      : {}),
    ...resolvePosition(input),
  };
}

function resolveDigitalAddress(value: string | null | undefined): ResolvedResidentialDetail {
  if (value === undefined) return {};
  if (value === null || value.trim() === '') return { residentialDigitalAddress: null };
  const normalized = normalizeDigitalAddress(value);
  if (!normalized) {
    throw new BadRequestException({
      code: 'INVALID_DIGITAL_ADDRESS',
      message: `Enter a Ghana Digital Address like ${DIGITAL_ADDRESS_EXAMPLE}: two letters, the area code, then four digits.`,
    });
  }
  return { residentialDigitalAddress: normalized };
}

function resolvePosition(input: ResidentialLocationInput): ResolvedResidentialDetail {
  const { residentialLatitude: lat, residentialLongitude: lng } = input;
  if (lat === undefined && lng === undefined) return {};
  if (lat == null && lng == null) {
    return {
      residentialLatitude: null,
      residentialLongitude: null,
      residentialPositionSource: null,
      residentialPositionAccuracyM: null,
      residentialPositionCapturedAt: null,
    };
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new BadRequestException({
      code: 'INVALID_RESIDENTIAL_POSITION',
      message: 'A map position needs both a latitude and a longitude.',
    });
  }
  if (!isInGhana(lat, lng)) {
    throw new BadRequestException({
      code: 'INVALID_RESIDENTIAL_POSITION',
      message: 'That position is outside Ghana.',
    });
  }
  const source = input.residentialPositionSource ?? 'PASTED';
  const accuracy = input.residentialPositionAccuracyM;
  const capturedAt = input.residentialPositionCapturedAt
    ? new Date(input.residentialPositionCapturedAt)
    : new Date();
  return {
    residentialLatitude: Math.round(lat * 1e6) / 1e6,
    residentialLongitude: Math.round(lng * 1e6) / 1e6,
    residentialPositionSource: source,
    // Only a device fix has an accuracy; a pasted pin's precision is unknown.
    residentialPositionAccuracyM:
      source === 'DEVICE' && typeof accuracy === 'number' ? Math.round(accuracy) : null,
    residentialPositionCapturedAt: Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt,
  };
}

/** True when a DTO/payload carries any residential location field. */
export function hasResidentialLocationInput(input: ResidentialLocationInput): boolean {
  return (
    input.residentialLocationStatus !== undefined ||
    input.residentialRegion !== undefined ||
    input.residentialDistrict !== undefined ||
    input.residentialCommunity !== undefined ||
    input.residentialAddressNote !== undefined ||
    input.residentialDigitalAddress !== undefined ||
    input.residentialLandmark !== undefined ||
    input.residentialLatitude !== undefined ||
    input.residentialLongitude !== undefined
  );
}
