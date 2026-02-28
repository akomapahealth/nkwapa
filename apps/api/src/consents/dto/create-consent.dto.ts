import { ConsentType } from "@prisma/client";

/** Body DTO for POST /clinics/:clinicId/patients/:patientId/consents */
export interface CreateConsentDto {
  consentType: ConsentType;
  consentTextSnapshot: string;
  consentVersion?: string;
  witnessName?: string;
  witnessPhoneE164?: string;
}
