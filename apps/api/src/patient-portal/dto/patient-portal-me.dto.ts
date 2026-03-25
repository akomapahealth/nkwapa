export interface PatientPortalMeResponse {
  patient: {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    dob: string | null;
    sex: string;
  };
  recommendations: {
    followUpDate: string | null;
    carePlanNotes: string | null;
    counselingGiven: boolean;
    medicationPrescribed: boolean;
  } | null;
  reminders: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    channel: string;
  }>;
}
