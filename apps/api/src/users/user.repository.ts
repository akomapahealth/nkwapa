import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole } from '@prisma/client';

export type UserWithClinicRoles = User & {
  clinicRoles: { clinicId: string | null; role: UserRole }[];
};

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKeycloakSub(keycloakSub: string): Promise<UserWithClinicRoles | null> {
    return this.prisma.user.findUnique({
      where: { keycloakSub },
      include: {
        clinicRoles: { select: { clinicId: true, role: true } },
      },
    });
  }

  async create(data: {
    keycloakSub: string;
    displayName: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    phoneE164?: string | null;
  }): Promise<User & { clinicRoles: { clinicId: string | null; role: string }[] }> {
    return this.prisma.user.create({
      data: {
        keycloakSub: data.keycloakSub,
        displayName: data.displayName,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneE164: data.phoneE164 ?? null,
      },
      include: {
        clinicRoles: { select: { clinicId: true, role: true } },
      },
    });
  }

  async update(
    id: string,
    data: {
      displayName?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      phoneE164?: string | null;
    },
  ): Promise<User & { clinicRoles: { clinicId: string | null; role: string }[] }> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: {
        clinicRoles: { select: { clinicId: true, role: true } },
      },
    });
  }

  async listAll(): Promise<
    {
      id: string;
      keycloakSub: string;
      displayName: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    }[]
  > {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        keycloakSub: true,
        displayName: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }

  async syncKeycloakProfile(
    id: string,
    data: { firstName?: string; lastName?: string; email?: string; phoneE164?: string | null },
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { firstName: true, lastName: true, phoneE164: true },
    });
    if (!existing) throw new Error('User not found');
    const updates: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phoneE164?: string | null;
    } = {};
    if (data.firstName != null && existing.firstName == null) updates.firstName = data.firstName;
    if (data.lastName != null && existing.lastName == null) updates.lastName = data.lastName;
    if (data.email != null) updates.email = data.email;
    if (data.phoneE164 != null && existing.phoneE164 == null) updates.phoneE164 = data.phoneE164;
    if (Object.keys(updates).length === 0) {
      return this.prisma.user.findUniqueOrThrow({ where: { id } });
    }
    return this.prisma.user.update({
      where: { id },
      data: updates,
    });
  }

  async findByIdWithRoles(id: string): Promise<{
    id: string;
    displayName: string;
    clinicRoles: {
      id: string;
      clinicId: string | null;
      role: UserRole;
      clinic: { name: string } | null;
    }[];
  } | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        clinicRoles: {
          select: {
            id: true,
            clinicId: true,
            role: true,
            clinic: { select: { name: true } },
          },
        },
      },
    });
  }
}
