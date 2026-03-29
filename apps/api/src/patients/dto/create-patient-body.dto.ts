import { NationalIdType, Sex } from "@prisma/client";

/** Body DTO for POST /clinics/:clinicId/patients; primaryClinicId from route. */
export interface CreatePatientBodyDto {
  firstName: string;
  lastName: string;
  dob?: string;
  sex?: Sex;
  phoneE164?: string;
  email?: string;
  nationalIdType: NationalIdType;
  nationalId: string;
}
