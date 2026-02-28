import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRepository } from '../users/user.repository';

export interface AdminActor {
  userId: string;
  roles: { clinicId: string | null; role: UserRole }[];
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userRepository: UserRepository
  ) {}

  async listUsers() {
    return this.userRepository.listAll();
  }

  async getUserRoles(userId: string) {
    const user = await this.userRepository.findByIdWithRoles(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.clinicRoles.map((r) => ({
      id: r.id,
      clinicId: r.clinicId,
      role: r.role,
      clinicName: r.clinic?.name ?? null,
    }));
  }

  async assignRole(
    actor: AdminActor,
    targetUserId: string,
    clinicId: string | null,
    role: UserRole
  ) {
    this.validateAssignRole(actor, clinicId, role);

    const targetExists = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetExists) {
      throw new NotFoundException('User not found');
    }

    if (role === UserRole.SYSTEM_ADMIN && clinicId != null) {
      throw new BadRequestException('SYSTEM_ADMIN must have clinicId null');
    }
    if (role !== UserRole.SYSTEM_ADMIN && clinicId == null) {
      throw new BadRequestException('Clinic is required for non-SYSTEM_ADMIN roles');
    }

    const existing = await this.prisma.userClinicRole.findFirst({
      where: {
        userId: targetUserId,
        clinicId,
        role,
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.userClinicRole.create({
      data: {
        userId: targetUserId,
        clinicId,
        role,
      },
    });
  }

  async removeRole(
    actor: AdminActor,
    targetUserId: string,
    clinicId: string | null,
    role: UserRole
  ) {
    this.validateRemoveRole(actor, clinicId, role);

    const existing = await this.prisma.userClinicRole.findFirst({
      where: {
        userId: targetUserId,
        clinicId,
        role,
      },
    });
    if (!existing) {
      throw new NotFoundException('Role assignment not found');
    }

    await this.prisma.userClinicRole.delete({
      where: { id: existing.id },
    });
    return { deleted: true };
  }

  private validateAssignRole(
    actor: AdminActor,
    clinicId: string | null,
    role: UserRole
  ) {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null
    );
    if (isSystemAdmin) return;

    if (role === UserRole.SYSTEM_ADMIN || role === UserRole.DIRECTOR) {
      throw new ForbiddenException(
        'Only System Admin can assign SYSTEM_ADMIN or DIRECTOR roles'
      );
    }

    if (clinicId == null) return;
    const isDirectorOfClinic = actor.roles.some(
      (r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR
    );
    if (!isDirectorOfClinic) {
      throw new ForbiddenException(
        'You can only assign roles for clinics you direct'
      );
    }
  }

  private validateRemoveRole(
    actor: AdminActor,
    clinicId: string | null,
    role: UserRole
  ) {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null
    );
    if (isSystemAdmin) return;

    if (role === UserRole.SYSTEM_ADMIN || role === UserRole.DIRECTOR) {
      throw new ForbiddenException(
        'Only System Admin can remove SYSTEM_ADMIN or DIRECTOR roles'
      );
    }

    if (clinicId == null) return;
    const isDirectorOfClinic = actor.roles.some(
      (r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR
    );
    if (!isDirectorOfClinic) {
      throw new ForbiddenException(
        'You can only remove roles for clinics you direct'
      );
    }
  }
}
