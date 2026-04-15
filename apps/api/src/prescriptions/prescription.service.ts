import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prescription, EncounterStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PrescriptionRepository } from './prescription.repository';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';

export interface AuditContext {
  clinicId: string;
  actorUserId: string;
  requestId?: string;
}

@Injectable()
export class PrescriptionService {
  constructor(
    private readonly prescriptionRepository: PrescriptionRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async ensureEncounterNotFinalized(encounterId: string): Promise<void> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { status: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.status === EncounterStatus.FINALIZED) {
      throw new BadRequestException('Cannot modify prescriptions on a finalized encounter');
    }
  }

  async create(
    clinicId: string,
    encounterId: string,
    dto: CreatePrescriptionDto,
    auditContext: AuditContext,
  ): Promise<Prescription> {
    await this.ensureEncounterNotFinalized(encounterId);

    const drug = await this.prisma.drug.findUnique({ where: { id: dto.drugId } });
    if (!drug) throw new NotFoundException('Drug not found');
    if (drug.clinicId !== clinicId) {
      throw new BadRequestException('Drug does not belong to this clinic');
    }

    const prescription = await this.prescriptionRepository.create({
      encounter: { connect: { id: encounterId } },
      clinic: { connect: { id: clinicId } },
      drug: { connect: { id: dto.drugId } },
      dosage: dto.dosage,
      frequency: dto.frequency,
      duration: dto.duration,
      quantity: dto.quantity,
      instructions: dto.instructions,
      prescribedBy: { connect: { id: auditContext.actorUserId } },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: auditContext.actorUserId,
      action: 'PRESCRIPTION.CREATE',
      entityType: 'Prescription',
      entityId: prescription.id,
      afterJson: JSON.stringify(prescription),
      requestId: auditContext.requestId,
    });

    return prescription;
  }

  async listByEncounter(encounterId: string) {
    return this.prescriptionRepository.listByEncounter(encounterId);
  }

  async update(
    id: string,
    dto: UpdatePrescriptionDto,
    auditContext: AuditContext,
  ): Promise<Prescription> {
    const existing = await this.prescriptionRepository.findById(id);
    if (!existing) throw new NotFoundException('Prescription not found');

    await this.ensureEncounterNotFinalized(existing.encounterId);

    const data: Record<string, unknown> = {};
    if (dto.dosage !== undefined) data.dosage = dto.dosage;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.duration !== undefined) data.duration = dto.duration;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.instructions !== undefined) data.instructions = dto.instructions;

    const updated = await this.prescriptionRepository.update(id, data);

    await this.auditService.logWrite({
      clinicId: auditContext.clinicId,
      actorUserId: auditContext.actorUserId,
      action: 'PRESCRIPTION.UPDATE',
      entityType: 'Prescription',
      entityId: id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updated),
      requestId: auditContext.requestId,
    });

    return updated;
  }

  async remove(id: string, auditContext: AuditContext): Promise<void> {
    const existing = await this.prescriptionRepository.findById(id);
    if (!existing) throw new NotFoundException('Prescription not found');

    await this.ensureEncounterNotFinalized(existing.encounterId);

    await this.prescriptionRepository.delete(id);

    await this.auditService.logWrite({
      clinicId: auditContext.clinicId,
      actorUserId: auditContext.actorUserId,
      action: 'PRESCRIPTION.DELETE',
      entityType: 'Prescription',
      entityId: id,
      beforeJson: JSON.stringify(existing),
      requestId: auditContext.requestId,
    });
  }
}
