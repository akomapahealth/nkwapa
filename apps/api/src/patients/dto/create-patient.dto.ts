import { GhanaRegion, NationalIdType, PatientLocationStatus, Sex } from '@prisma/client';

/** DTO for creating patient; primaryClinicId comes from route param. */
export interface CreatePatientDto {
  primaryClinicId: string; // set by controller from :clinicId
  firstName: string;
  lastName: string;
  dob?: Date;
  sex?: Sex;
  phoneE164?: string;
  email?: string;
  nationalIdType: NationalIdType;
  /** Plaintext, encrypted and hashed by the service. Absent for NONE, which stores the patient code. */
  nationalId?: string;
  createdByUserId?: string;
  // Residential location (see ResidentialLocationDto); resolved by service.
  residentialLocationStatus?: PatientLocationStatus;
  residentialRegion?: GhanaRegion;
  residentialDistrict?: string;
  residentialCommunity?: string;
  residentialAddressNote?: string;
}
