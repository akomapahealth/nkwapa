import { BadRequestException } from '@nestjs/common';
import { normalizeDistrict } from '@nkwapa/db';
import { GhanaRegion, PatientLocationStatus } from '@prisma/client';

/** Raw residential location fields as supplied by create/update/sync payloads. */
export interface ResidentialLocationInput {
  residentialLocationStatus?: PatientLocationStatus;
  residentialRegion?: GhanaRegion;
  residentialDistrict?: string;
  residentialCommunity?: string;
  residentialAddressNote?: string;
}

/** Resolved residential location, ready to persist. */
export interface ResolvedResidentialLocation {
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
}

/**
 * Enforce the deliberate residential-location invariant so a missing location is
 * never ambiguous blank text. Shared by the patient service and the offline
 * sync path so both persist an identical, consistent shape:
 * - RECORDED requires a region (district is normalized to its canonical name);
 * - UNKNOWN / NOT_RECORDED clear every granular field;
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
  };
}

/** True when a DTO/payload carries any residential location field. */
export function hasResidentialLocationInput(input: ResidentialLocationInput): boolean {
  return (
    input.residentialLocationStatus !== undefined ||
    input.residentialRegion !== undefined ||
    input.residentialDistrict !== undefined ||
    input.residentialCommunity !== undefined ||
    input.residentialAddressNote !== undefined
  );
}
