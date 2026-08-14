import { Injectable } from '@nestjs/common';
import { ClinicalNoteStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const CLINICAL_NOTE_INCLUDE = {
  author: { select: { id: true, displayName: true } },
  submittedBy: { select: { id: true, displayName: true } },
  cosignedBy: { select: { id: true, displayName: true } },
  assignedVolunteer: { select: { id: true, displayName: true } },
  assignedDoctor: { select: { id: true, displayName: true } },
  addenda: {
    include: { author: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ClinicalNoteInclude;

@Injectable()
export class ClinicalNoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEncounterNote(clinicId: string, encounterId: string) {
    return this.prisma.clinicalNote.findFirst({
      where: { clinicId, encounterId },
      include: CLINICAL_NOTE_INCLUDE,
    });
  }

  findPatientNotes(clinicId: string, patientId: string) {
    return this.prisma.clinicalNote.findMany({
      where: { clinicId, patientId },
      select: {
        id: true,
        encounterId: true,
        status: true,
        authorRole: true,
        createdAt: true,
        updatedAt: true,
        submittedAt: true,
        cosignedAt: true,
        author: { select: { id: true, displayName: true } },
        assignedDoctor: { select: { id: true, displayName: true } },
        _count: { select: { addenda: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findPendingForDoctor(clinicId: string, doctorUserId: string) {
    return this.prisma.clinicalNote.findMany({
      where: {
        clinicId,
        status: ClinicalNoteStatus.PENDING_COSIGN,
        assignedDoctorId: doctorUserId,
      },
      select: {
        id: true,
        encounterId: true,
        patientId: true,
        submittedAt: true,
        assignedDoctorNameSnapshot: true,
        author: { select: { id: true, displayName: true } },
        patient: {
          select: { patientCode: true, firstName: true, lastName: true },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }
}
