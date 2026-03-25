import { Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { DisabledUserException } from '../auth/disabled-user.exception';
import { UserRepository } from './user.repository';

export interface UserWithRoles {
  user: User;
  roles: { clinicId: string | null; role: UserRole }[];
}

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findOrCreateByKeycloakSub(
    sub: string,
    displayName?: string | null,
    email?: string | null,
    firstName?: string | null,
    lastName?: string | null
  ): Promise<UserWithRoles> {
    const existing = await this.userRepository.findByKeycloakSub(sub);
    if (existing) {
      if (!existing.isActive) {
        throw new DisabledUserException();
      }
      const updated = await this.userRepository.syncKeycloakProfile(existing.id, {
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        email: email ?? undefined,
      });
      const roles = existing.clinicRoles.map((r: { clinicId: string | null; role: UserRole }) => ({
        clinicId: r.clinicId,
        role: r.role as UserRole,
      }));
      return {
        user: updated,
        roles,
      };
    }

    const display =
      firstName && lastName
        ? `${firstName} ${lastName}`.trim()
        : displayName ?? email ?? sub;
    const created = await this.userRepository.create({
      keycloakSub: sub,
      displayName: display,
      email: email ?? undefined,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
    });
    const roles = created.clinicRoles.map((r) => ({
      clinicId: r.clinicId,
      role: r.role as UserRole,
    }));
    return {
      user: created,
      roles,
    };
  }
}
