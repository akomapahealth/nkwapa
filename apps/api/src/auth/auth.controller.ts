import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ClinicService } from '../clinics/clinic.service';
import { computeEffectivePermissions } from './constants/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimit } from '../common/rate-limit.decorator';

export interface ReqUser {
  user: { id: string; keycloakSub: string; displayName: string; email: string | null };
  roles: { clinicId: string | null; role: string }[];
}

export interface Membership {
  clinicId: string;
  clinicName: string;
  roles: string[];
}

export interface WhoAmIResponse {
  userId: string;
  keycloakSub: string;
  displayName: string;
  memberships: Membership[];
  globalRoles: string[];
  activeClinicId: string | null;
  effectiveRolesForActiveClinic: string[];
  effectivePermissionsForActiveClinic: string[];
  onboarding: {
    state: 'PATIENT_CLAIM_REQUIRED';
    pendingInvites: Array<{
      id: string;
      clinicId: string;
      clinicName: string;
      patientId: string;
      patientName: string;
      patientCode: string;
      email: string | null;
      phoneE164: string | null;
      createdAt: string;
      expiresAt: string | null;
    }>;
  } | null;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly clinicService: ClinicService,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @RateLimit({ key: 'auth_me', limit: 120, windowSeconds: 60, scope: 'user-or-ip' })
  getProfile(@Request() req: { user: ReqUser }) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Get('whoami')
  @RateLimit({ key: 'auth_whoami', limit: 60, windowSeconds: 60, scope: 'user-or-ip' })
  async whoami(
    @Request() req: { user: ReqUser; headers?: { 'x-clinic-id'?: string } },
  ): Promise<WhoAmIResponse> {
    const { user, roles } = req.user;

    const byClinicId = new Map<string | 'global', { clinicId: string | null; role: string }[]>();
    for (const r of roles) {
      const key = r.clinicId ?? 'global';
      const list = byClinicId.get(key) ?? [];
      list.push({ clinicId: r.clinicId, role: r.role });
      byClinicId.set(key, list);
    }

    const clinicIds = [...byClinicId.keys()].filter((k): k is string => k !== 'global');
    const clinics = clinicIds.length > 0 ? await this.clinicService.findByIds(clinicIds) : [];
    const clinicMap = new Map(clinics.map((c) => [c.id, c]));

    const globalRoles = byClinicId.has('global')
      ? [...new Set((byClinicId.get('global') ?? []).map((r) => r.role))]
      : [];

    const memberships: Membership[] = [];
    for (const cid of clinicIds.sort()) {
      const roleEntries = byClinicId.get(cid) ?? [];
      const roleNames = [...new Set(roleEntries.map((r) => r.role))];
      const clinic = clinicMap.get(cid) ?? null;
      memberships.push({
        clinicId: cid,
        clinicName: clinic?.name ?? '',
        roles: roleNames,
      });
    }

    const sortedClinicIds = [...clinicIds].sort();
    const headerClinicId = req.headers?.['x-clinic-id']?.trim();
    const isSystemAdmin = roles.some((r) => r.role === 'SYSTEM_ADMIN' && r.clinicId === null);
    const hasMembership = (cid: string) => roles.some((r) => r.clinicId === cid) || isSystemAdmin;

    let activeClinicId: string | null;
    if (headerClinicId && hasMembership(headerClinicId)) {
      activeClinicId = headerClinicId;
    } else {
      activeClinicId = sortedClinicIds.length > 0 ? sortedClinicIds[0] : null;
    }

    const activeRoles =
      activeClinicId != null
        ? (byClinicId.get(activeClinicId) ?? []).map((r) => r.role as UserRole)
        : [];
    const globalRoleList = (byClinicId.get('global') ?? []).map((r) => r.role as UserRole);
    const allEffectiveRoles = [...new Set([...activeRoles, ...globalRoleList])];
    const effectiveRolesForActiveClinic = allEffectiveRoles;
    const effectivePermissionsForActiveClinic = computeEffectivePermissions(allEffectiveRoles);
    const onboarding =
      roles.length === 0 ? await this.findPendingPatientClaimOnboarding(user.id) : null;

    return {
      userId: user.id,
      keycloakSub: user.keycloakSub,
      displayName: user.displayName,
      memberships,
      globalRoles,
      activeClinicId,
      effectiveRolesForActiveClinic,
      effectivePermissionsForActiveClinic,
      onboarding,
    };
  }

  private async findPendingPatientClaimOnboarding(
    userId: string,
  ): Promise<WhoAmIResponse['onboarding']> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        phoneE164: true,
        isActive: true,
      },
    });

    if (!user?.isActive) {
      return null;
    }

    const orConditions = [];
    if (user.email) {
      orConditions.push({
        email: {
          equals: user.email,
          mode: 'insensitive' as const,
        },
      });
    }
    if (user.phoneE164) {
      orConditions.push({
        phoneE164: user.phoneE164,
      });
    }

    if (orConditions.length === 0) {
      return null;
    }

    const invites = await this.prisma.patientPortalInvite.findMany({
      where: {
        status: 'PENDING',
        OR: orConditions,
        patient: {
          mergedIntoPatientId: null,
        },
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (invites.length === 0) {
      return null;
    }

    return {
      state: 'PATIENT_CLAIM_REQUIRED',
      pendingInvites: invites.map((invite) => ({
        id: invite.id,
        clinicId: invite.clinicId,
        clinicName: invite.clinic.name,
        patientId: invite.patientId,
        patientName: `${invite.patient.firstName} ${invite.patient.lastName}`.trim(),
        patientCode: invite.patient.patientCode,
        email: invite.email,
        phoneE164: invite.phoneE164,
        createdAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt?.toISOString() ?? null,
      })),
    };
  }
}
