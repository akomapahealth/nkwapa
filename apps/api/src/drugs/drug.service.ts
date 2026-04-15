import { Injectable, NotFoundException } from '@nestjs/common';
import { Drug, DrugCategory } from '@prisma/client';
import { DrugRepository } from './drug.repository';
import { AuditService } from '../audit/audit.service';
import { CreateDrugDto } from './dto/create-drug.dto';
import { UpdateDrugDto } from './dto/update-drug.dto';

export interface AuditContext {
  clinicId: string;
  actorUserId: string;
  requestId?: string;
}

@Injectable()
export class DrugService {
  constructor(
    private readonly drugRepository: DrugRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(clinicId: string, dto: CreateDrugDto, auditContext: AuditContext): Promise<Drug> {
    const drug = await this.drugRepository.create({
      clinic: { connect: { id: clinicId } },
      name: dto.name,
      genericName: dto.genericName,
      category: dto.category ?? 'OTHER',
      dosageForms: dto.dosageForms,
      contraindications: dto.contraindications,
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: auditContext.actorUserId,
      action: 'DRUG.CREATE',
      entityType: 'Drug',
      entityId: drug.id,
      afterJson: JSON.stringify(drug),
      requestId: auditContext.requestId,
    });

    return drug;
  }

  async findById(id: string): Promise<Drug | null> {
    return this.drugRepository.findById(id);
  }

  async search(clinicId: string, params: { q?: string; category?: DrugCategory }): Promise<Drug[]> {
    return this.drugRepository.search(clinicId, params);
  }

  async update(id: string, dto: UpdateDrugDto, auditContext: AuditContext): Promise<Drug> {
    const existing = await this.drugRepository.findById(id);
    if (!existing) throw new NotFoundException('Drug not found');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.genericName !== undefined) data.genericName = dto.genericName;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.dosageForms !== undefined) data.dosageForms = dto.dosageForms;
    if (dto.contraindications !== undefined) data.contraindications = dto.contraindications;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.drugRepository.update(id, data);

    await this.auditService.logWrite({
      clinicId: auditContext.clinicId,
      actorUserId: auditContext.actorUserId,
      action: 'DRUG.UPDATE',
      entityType: 'Drug',
      entityId: id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updated),
      requestId: auditContext.requestId,
    });

    return updated;
  }
}
