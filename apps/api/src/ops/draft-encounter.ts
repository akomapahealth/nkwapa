import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Open the DRAFT encounter a visit's clinical data is recorded against.
 *
 * Shared by the two ways a visit starts: the assigned volunteer starting intake, and (#167) the
 * first station claim of a check-in.
 */
export async function createDraftEncounter(
  tx: Prisma.TransactionClient,
  data: {
    clinicId: string;
    patientId: string;
    createdByUserId: string;
  },
) {
  const [clinic, patient, user] = await Promise.all([
    tx.clinic.findFirst({ where: { id: data.clinicId, isActive: true } }),
    tx.patient.findUnique({ where: { id: data.patientId } }),
    tx.user.findFirst({ where: { id: data.createdByUserId, isActive: true } }),
  ]);

  if (!clinic) throw new NotFoundException('Clinic not found');
  if (!patient || patient.primaryClinicId !== data.clinicId) {
    throw new NotFoundException('Patient not found for this clinic');
  }
  if (!user) throw new NotFoundException('User not found');

  return tx.encounter.create({
    data: {
      clinicId: data.clinicId,
      patientId: data.patientId,
      status: 'DRAFT',
      createdByUserId: data.createdByUserId,
    },
  });
}
