export type ClinicalNoteStatus = 'DRAFT' | 'PENDING_COSIGN' | 'COSIGNED' | 'AMENDED';

export interface ClinicalNotePerson {
  id: string;
  displayName: string;
}

export interface ClinicalNoteAddendum {
  id: string;
  reason: string;
  content: string;
  createdAt: string;
  author: ClinicalNotePerson;
}

export interface ClinicalNote {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  status: ClinicalNoteStatus;
  version: number;
  history: string;
  assessment: string;
  plan: string;
  signedHistory?: string | null;
  signedAssessment?: string | null;
  signedPlan?: string | null;
  signedContentHash?: string | null;
  authorUserId: string;
  authorRole: 'DOCTOR' | 'VOLUNTEER';
  author: ClinicalNotePerson;
  assignedVolunteer?: ClinicalNotePerson | null;
  assignedDoctor?: ClinicalNotePerson | null;
  assignedVolunteerNameSnapshot?: string | null;
  assignedDoctorNameSnapshot?: string | null;
  submittedBy?: ClinicalNotePerson | null;
  submittedAt?: string | null;
  cosignedBy?: ClinicalNotePerson | null;
  cosignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  addenda: ClinicalNoteAddendum[];
}

export interface ClinicalNoteSummary {
  id: string;
  encounterId: string;
  status: ClinicalNoteStatus;
  authorRole: 'DOCTOR' | 'VOLUNTEER';
  author: ClinicalNotePerson;
  assignedDoctor?: ClinicalNotePerson | null;
  submittedAt?: string | null;
  cosignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { addenda: number };
}

export function clinicalNoteStatusLabel(status: ClinicalNoteStatus) {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'PENDING_COSIGN':
      return 'Pending cosign';
    case 'COSIGNED':
      return 'Cosigned';
    case 'AMENDED':
      return 'Amended';
  }
}
