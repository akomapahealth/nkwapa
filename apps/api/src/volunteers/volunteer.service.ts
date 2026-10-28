import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VolunteerContact } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailDeliverabilityService } from '../common/email-policy';
import type { CreateVolunteerDto, UpdateVolunteerDto } from './dto/volunteer.dto';

/** What the audit trail keeps of a contact. Email and phone are the point of the history. */
function snapshot(contact: VolunteerContact) {
  return JSON.stringify({
    displayName: contact.displayName,
    email: contact.email,
    phoneE164: contact.phoneE164,
    notes: contact.notes,
    isActive: contact.isActive,
    linkedUserId: contact.linkedUserId,
  });
}

/**
 * The clinic's volunteer directory (#226): people who volunteer, with or without an account.
 *
 * Every lookup is by id and path clinic, so an id from another clinic reads as missing (404)
 * rather than forbidden. Runs inside the request's RLS transaction, which is the second wall.
 */
@Injectable()
export class VolunteerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailDeliverabilityService: EmailDeliverabilityService,
  ) {}

  async list(clinicId: string) {
    const [contacts, staff] = await Promise.all([
      this.prisma.volunteerContact.findMany({
        where: { clinicId },
        include: { linkedUser: { select: { id: true, displayName: true } } },
        orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
      }),
      this.clinicStaffWithEmail(clinicId),
    ]);
    const byEmail = new Map(staff.map((user) => [user.email, user]));
    return {
      items: contacts.map((contact) => {
        // Offered, never applied: the manager links explicitly.
        const candidate = contact.linkedUserId ? undefined : byEmail.get(contact.email);
        return {
          ...this.serialize(contact),
          linkedUser: contact.linkedUser,
          linkCandidate: candidate
            ? { id: candidate.id, displayName: candidate.displayName }
            : null,
        };
      }),
    };
  }

  async create(clinicId: string, actorUserId: string, dto: CreateVolunteerDto) {
    await this.assertEmailFree(clinicId, dto.email);
    await this.emailDeliverabilityService.assertDomainAcceptsEmail(dto.email);
    const contact = await this.prisma.volunteerContact.create({
      data: {
        clinicId,
        displayName: dto.displayName,
        email: dto.email,
        phoneE164: dto.phoneE164 || null,
        notes: dto.notes || null,
        createdByUserId: actorUserId,
      },
    });
    await this.audit(clinicId, actorUserId, 'VOLUNTEER.CREATE', contact, null);
    return this.serialize(contact);
  }

  async update(clinicId: string, id: string, actorUserId: string, dto: UpdateVolunteerDto) {
    const before = await this.find(clinicId, id);
    const emailChanged = dto.email !== undefined && dto.email !== before.email;
    if (emailChanged) {
      await this.assertEmailFree(clinicId, dto.email!);
      await this.emailDeliverabilityService.assertDomainAcceptsEmail(dto.email!);
    }
    const contact = await this.prisma.volunteerContact.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(emailChanged && { email: dto.email }),
        ...(dto.phoneE164 !== undefined && { phoneE164: dto.phoneE164 || null }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
      },
    });
    await this.audit(clinicId, actorUserId, 'VOLUNTEER.UPDATE', contact, before);
    return this.serialize(contact);
  }

  async setActive(clinicId: string, id: string, actorUserId: string, isActive: boolean) {
    const before = await this.find(clinicId, id);
    const contact = await this.prisma.volunteerContact.update({
      where: { id },
      data: { isActive },
    });
    await this.audit(
      clinicId,
      actorUserId,
      isActive ? 'VOLUNTEER.REACTIVATE' : 'VOLUNTEER.DEACTIVATE',
      contact,
      before,
    );
    return this.serialize(contact);
  }

  /**
   * Link a contact to an existing account. Both conditions are read here, never taken from the
   * client: the user holds a role at this clinic, and their email is the contact's email.
   */
  async link(clinicId: string, id: string, actorUserId: string, userId: string) {
    const before = await this.find(clinicId, id);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, clinicRoles: { some: { clinicId } } },
      select: { id: true, email: true },
    });
    if (!user || user.email?.trim().toLowerCase() !== before.email) {
      throw new BadRequestException({
        code: 'VOLUNTEER_LINK_NOT_ALLOWED',
        message:
          'A contact can only be linked to an account with a role at this clinic and the same email address.',
      });
    }
    const contact = await this.prisma.volunteerContact.update({
      where: { id },
      data: { linkedUserId: user.id },
    });
    await this.audit(clinicId, actorUserId, 'VOLUNTEER.LINK', contact, before);
    return this.serialize(contact);
  }

  async unlink(clinicId: string, id: string, actorUserId: string) {
    const before = await this.find(clinicId, id);
    const contact = await this.prisma.volunteerContact.update({
      where: { id },
      data: { linkedUserId: null },
    });
    await this.audit(clinicId, actorUserId, 'VOLUNTEER.UNLINK', contact, before);
    return this.serialize(contact);
  }

  private async find(clinicId: string, id: string) {
    const contact = await this.prisma.volunteerContact.findFirst({ where: { id, clinicId } });
    if (!contact) throw new NotFoundException('Volunteer not found');
    return contact;
  }

  /**
   * Checked before writing rather than by catching the unique violation: a failed insert aborts
   * the request's transaction, and the 409 must carry the existing id for "Open existing".
   */
  private async assertEmailFree(clinicId: string, email: string) {
    const existing = await this.prisma.volunteerContact.findFirst({
      where: { clinicId, email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'VOLUNTEER_EMAIL_EXISTS',
        message: 'A volunteer with this email is already in the directory.',
        existingId: existing.id,
      });
    }
  }

  private async clinicStaffWithEmail(clinicId: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, email: { not: null }, clinicRoles: { some: { clinicId } } },
      select: { id: true, displayName: true, email: true },
    });
    return users.map((user) => ({ ...user, email: user.email!.trim().toLowerCase() }));
  }

  private audit(
    clinicId: string,
    actorUserId: string,
    action: string,
    after: VolunteerContact,
    before: VolunteerContact | null,
  ) {
    return this.auditService.logWrite({
      clinicId,
      actorUserId,
      action,
      entityType: 'VolunteerContact',
      entityId: after.id,
      beforeJson: before ? snapshot(before) : null,
      afterJson: snapshot(after),
    });
  }

  private serialize(contact: VolunteerContact) {
    return {
      id: contact.id,
      displayName: contact.displayName,
      email: contact.email,
      phoneE164: contact.phoneE164,
      notes: contact.notes,
      isActive: contact.isActive,
      linkedUserId: contact.linkedUserId,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }
}
