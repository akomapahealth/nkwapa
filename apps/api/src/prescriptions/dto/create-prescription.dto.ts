export interface CreatePrescriptionDto {
  drugId: string;
  dosage: string;
  frequency: string;
  duration?: string;
  quantity?: number;
  instructions?: string;
}
