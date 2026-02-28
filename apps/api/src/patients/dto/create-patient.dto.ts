import { NationalIdType, Sex } from "@prisma/client";

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
  nationalId: string; // plaintext, encrypted/hashed by service
  createdByUserId?: string;
}
