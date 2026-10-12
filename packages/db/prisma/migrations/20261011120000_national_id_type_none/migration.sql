-- Patients with no ID document (#204). Their ciphertext and hash hold the patient's own
-- patientCode, so the NOT NULL columns and the unique hash still hold.
ALTER TYPE "NationalIdType" ADD VALUE 'NONE';
