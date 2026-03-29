import { Sex } from "@prisma/client";

/** Body DTO for PATCH /clinics/:clinicId/patients/:patientId. National ID is immutable. */
export interface UpdatePatientBodyDto {
  firstName?: string;
  lastName?: string;
  dob?: string;
  sex?: Sex;
  phoneE164?: string;
  email?: string;
}
