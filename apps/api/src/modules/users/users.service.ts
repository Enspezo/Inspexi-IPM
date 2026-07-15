import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User, Role, TaskStatus, Availability } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, assertSameOrg, sanitizeStorageExtension, isManagement, hasRole, ORG_ADMINS } from '@/common';
import { EmailService } from '@/common/services/email.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '@/common/services/storage/storage.interface';
import {
  InviteUserDto,
  AcceptInvitationDto,
  ChangeRoleDto,
  UpdateProfileDto,
  AdminUpdateUserDto,
  UpdateSignatureDto,
} from './dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private config: ConfigService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  async findAllByOrg(orgId: string | null, isSuperuser: boolean) {
    if (isSuperuser) {
      return this.prisma.user.findMany({
        where: orgId ? { orgId, isDeleted: false } : { isDeleted: false },
        include: { organization: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!orgId) {
      throw new ForbiddenException();
    }

    return this.prisma.user.findMany({
      where: { orgId, isDeleted: false },
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lichte, org-scoped gebruikerslijst voor persoon-/team-pickers. Toegankelijk
   * voor brede rollen; geeft alleen niet-gevoelige velden terug en kan op rol
   * gefilterd worden (`roles hasSome [role]`). (REQ5)
   */
  async findSelectable(orgId: string | null, role?: Role) {
    if (!orgId) {
      // SUPERUSER zonder org-context heeft geen zinvolle org-scoped lijst.
      return [];
    }
    return this.prisma.user.findMany({
      where: {
        orgId,
        isDeleted: false,
        isActive: true,
        ...(role ? { roles: { hasSome: [role] } } : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true, roles: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async findOne(id: string) {
    return assertFound(
      await this.prisma.user.findUnique({
        where: { id },
        include: { organization: true },
      }),
      'Gebruiker',
    );
  }

  async invite(orgId: string | null, dto: InviteUserDto, invitedBy: User) {
    if (!orgId) {
      throw new BadRequestException('Organisatie is vereist voor uitnodigingen');
    }

    // Check role hierarchy
    if (dto.role === Role.SUPERUSER && !invitedBy.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException(
        'Alleen een superuser kan een superuser uitnodigen',
      );
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Er bestaat al een gebruiker met dit e-mailadres');
    }

    // Check if there's already a pending invitation
    const existingInvite = await this.prisma.invitation.findFirst({
      where: {
        email: dto.email,
        orgId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvite) {
      throw new ConflictException(
        'Er staat al een actieve uitnodiging open voor dit e-mailadres',
      );
    }

    const invitation = await this.prisma.invitation.create({
      data: {
        orgId,
        email: dto.email,
        role: dto.role,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    const publicUrl = this.config.get<string>('PUBLIC_URL');
    const inviteUrl = `${publicUrl}/invite/${invitation.token}`;

    try {
      await this.emailService.sendInvitation(
        dto.email,
        inviteUrl,
        org?.name || 'InspeXi',
        dto.role,
        orgId,
      );
    } catch {
      // Invitation opruimen, anders blokkeert de ConflictException een retry
      await this.prisma.invitation.delete({ where: { id: invitation.id } });
      throw new BadRequestException(
        'Uitnodigingsmail kon niet verzonden worden. Probeer het opnieuw.',
      );
    }

    return invitation;
  }

  /**
   * Beschikbaarheidsstatus van de gebruiker bijwerken (interne chat — REQ1).
   * Bewust via raw SQL zodat de audit-middleware (User is geaudit) niet bij elke
   * statuswissel ruis logt; presence + lastSeenAt veranderen frequent.
   */
  async updatePresence(
    userId: string,
    availability: Availability,
    availabilityNote?: string | null,
  ) {
    await this.prisma.$executeRaw`
      UPDATE imp_users
      SET availability = ${availability}::"Availability",
          availability_note = ${availabilityNote ?? null},
          last_seen_at = now()
      WHERE id = ${userId}::uuid
    `;
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, availability: true, availabilityNote: true, lastSeenAt: true },
    });
  }

  async getPresence(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, availability: true, availabilityNote: true, lastSeenAt: true },
    });
  }

  async rotateIcalToken(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { icalToken: randomUUID() },
      select: { icalToken: true },
    });
    this.logger.log(`iCal-token vernieuwd voor gebruiker ${userId}`);
    return updated;
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
    });

    if (!invitation) {
      throw new BadRequestException('Ongeldige uitnodiging');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Uitnodiging is al geaccepteerd');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Uitnodiging is verlopen');
    }

    // Check if email is already in use
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });
    if (existingUser) {
      throw new ConflictException('Er bestaat al een account met dit e-mailadres');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const [user] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          orgId: invitation.orgId,
          email: invitation.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roles: [invitation.role],
          emailVerifiedAt: new Date(),
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async deactivate(id: string, currentUser: User) {
    if (id === currentUser.id) {
      throw new ForbiddenException('Je kunt je eigen account niet deactiveren');
    }

    const user = await this.findOne(id);

    // Check tenant isolation
    if (
      !currentUser.roles.includes(Role.SUPERUSER) &&
      user.orgId !== currentUser.orgId
    ) {
      throw new ForbiddenException();
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async activate(id: string, currentUser: User) {
    const user = await this.findOne(id);

    if (
      !currentUser.roles.includes(Role.SUPERUSER) &&
      user.orgId !== currentUser.orgId
    ) {
      throw new ForbiddenException();
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async changeRole(id: string, dto: ChangeRoleDto, currentUser: User) {
    if (id === currentUser.id) {
      throw new ForbiddenException('Je kunt je eigen rol niet wijzigen');
    }

    const user = await this.findOne(id);

    // Check tenant isolation
    if (
      !currentUser.roles.includes(Role.SUPERUSER) &&
      user.orgId !== currentUser.orgId
    ) {
      throw new ForbiddenException();
    }

    // Alleen SUPERUSER mag SUPERUSER-rol toewijzen
    if (dto.roles.includes(Role.SUPERUSER) && !currentUser.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException(
        'Alleen een superuser kan de superuser rol toewijzen',
      );
    }

    // SUPERUSER mag niet gecombineerd worden met andere rollen
    if (dto.roles.includes(Role.SUPERUSER) && dto.roles.length > 1) {
      throw new BadRequestException(
        'SUPERUSER kan niet gecombineerd worden met andere rollen',
      );
    }

    await this.prisma.user.update({
      where: { id },
      data: { roles: dto.roles },
    });
  }

  async adminResetPassword(
    id: string,
    newPassword: string,
    currentUser: User,
  ) {
    if (id === currentUser.id) {
      throw new ForbiddenException(
        'Gebruik het profiel-scherm om uw eigen wachtwoord te wijzigen',
      );
    }

    const user = await this.findOne(id);

    // Tenant isolatie
    if (
      !currentUser.roles.includes(Role.SUPERUSER) &&
      user.orgId !== currentUser.orgId
    ) {
      throw new ForbiddenException();
    }

    // ORG_ADMIN mag geen andere ORG_ADMIN of SUPERUSER resetten
    if (
      currentUser.roles.includes(Role.ORG_ADMIN) &&
      (user.roles.includes(Role.SUPERUSER) || user.roles.includes(Role.ORG_ADMIN))
    ) {
      throw new ForbiddenException(
        'U heeft geen bevoegdheid om het wachtwoord van deze gebruiker te resetten',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    // Revoke alle actieve sessies zodat de gebruiker opnieuw moet inloggen
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const data: any = {};

    if (dto.firstName) data.firstName = dto.firstName;
    if (dto.lastName) data.lastName = dto.lastName;
    if (dto.initials !== undefined) data.initials = dto.initials || null;

    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('E-mailadres is al in gebruik');
      }
      data.email = dto.email;
      data.emailVerifiedAt = null; // Reset verification
    }

    if ('homeStreet' in dto) data.homeStreet = dto.homeStreet || null;
    if ('homeHouseNumber' in dto) data.homeHouseNumber = dto.homeHouseNumber || null;
    if ('homePostalCode' in dto) data.homePostalCode = dto.homePostalCode || null;
    if ('homeCity' in dto) data.homeCity = dto.homeCity || null;
    if ('homeLat' in dto) data.homeLat = dto.homeLat ?? null;
    if ('homeLng' in dto) data.homeLng = dto.homeLng ?? null;

    // Klantportaal-contactgegevens + per-kanaal toestemming.
    if (dto.contactPhone !== undefined) data.contactPhone = (dto.contactPhone || '').trim() || null;
    if (dto.contactEmail !== undefined) data.contactEmail = (dto.contactEmail || '').trim() || null;
    if (dto.sharePhoneWithClients !== undefined) data.sharePhoneWithClients = dto.sharePhoneWithClients;
    if (dto.shareEmailWithClients !== undefined) data.shareEmailWithClients = dto.shareEmailWithClients;
    // Toestemming heeft alleen effect bij een ingevulde waarde: wordt de waarde in dit verzoek
    // leeggemaakt, dan vervalt de bijbehorende toestemming automatisch (defensief; de resolutie
    // dwingt dit ook al af).
    if (dto.contactPhone !== undefined && !data.contactPhone) data.sharePhoneWithClients = false;
    if (dto.contactEmail !== undefined && !data.contactEmail) data.shareEmailWithClients = false;

    // Standaard vrijwillige goedkeurder (persoon): org-scoped valideren (REQ5).
    if ('defaultApprovalPersonId' in dto) {
      if (!dto.defaultApprovalPersonId) {
        data.defaultApprovalPersonId = null;
      } else if (dto.defaultApprovalPersonId === id) {
        throw new BadRequestException('U kunt uzelf niet als standaard goedkeurder instellen');
      } else {
        const me = await this.prisma.user.findUnique({ where: { id }, select: { orgId: true } });
        await assertSameOrg(this.prisma.user, dto.defaultApprovalPersonId, me?.orgId ?? null, 'Goedkeurder');
        data.defaultApprovalPersonId = dto.defaultApprovalPersonId;
      }
    }

    return this.prisma.user.update({
      where: { id },
      data,
      include: { organization: true },
    });
  }

  async adminUpdateUser(id: string, dto: AdminUpdateUserDto, actor: User) {
    const target = await this.findOne(id);
    if (!actor.roles.includes(Role.SUPERUSER) && target.orgId !== actor.orgId) {
      throw new ForbiddenException();
    }

    // PRD-12: de route is verbreed naar MANAGEMENT_ROLES zodat een MANAGER de
    // dienstvorm kan zetten. Een MANAGER (zonder ORG_ADMIN/SUPERUSER) mag via
    // deze generieke admin-update echter uitsluitend `employmentType` muteren —
    // elk ander (gedefinieerd) veld levert 403 op.
    if (!hasRole(actor, ORG_ADMINS)) {
      const touchesOtherField = Object.keys(dto).some(
        (key) => key !== 'employmentType' && (dto as Record<string, unknown>)[key] !== undefined,
      );
      if (touchesOtherField) {
        throw new ForbiddenException(
          'Als manager kunt u alleen de dienstvorm van een gebruiker wijzigen',
        );
      }
    }

    const data: any = {};
    if (dto.firstName) data.firstName = dto.firstName;
    if (dto.lastName) data.lastName = dto.lastName;
    if (dto.initials !== undefined) data.initials = dto.initials || null;

    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('E-mailadres is al in gebruik');
      }
      data.email = dto.email;
      data.emailVerifiedAt = null;
    }

    if ('homeStreet' in dto) data.homeStreet = dto.homeStreet || null;
    if ('homeHouseNumber' in dto) data.homeHouseNumber = dto.homeHouseNumber || null;
    if ('homePostalCode' in dto) data.homePostalCode = dto.homePostalCode || null;
    if ('homeCity' in dto) data.homeCity = dto.homeCity || null;
    if ('homeLat' in dto) data.homeLat = dto.homeLat ?? null;
    if ('homeLng' in dto) data.homeLng = dto.homeLng ?? null;

    // Klantportaal-contactgegevens + per-kanaal toestemming (namens de inspecteur beheerd).
    // Identieke normalisatie als in updateProfile.
    if (dto.contactPhone !== undefined) data.contactPhone = (dto.contactPhone || '').trim() || null;
    if (dto.contactEmail !== undefined) data.contactEmail = (dto.contactEmail || '').trim() || null;
    if (dto.sharePhoneWithClients !== undefined) data.sharePhoneWithClients = dto.sharePhoneWithClients;
    if (dto.shareEmailWithClients !== undefined) data.shareEmailWithClients = dto.shareEmailWithClients;
    // Toestemming vervalt automatisch wanneer de bijbehorende waarde in dit verzoek leeg wordt gemaakt.
    if (dto.contactPhone !== undefined && !data.contactPhone) data.sharePhoneWithClients = false;
    if (dto.contactEmail !== undefined && !data.contactEmail) data.shareEmailWithClients = false;

    // Dienstvorm (PRD-12): alleen MANAGEMENT_ROLES mag dit veld muteren.
    // NB: `dto.employmentType !== undefined` (niet `'employmentType' in dto`) —
    // class-transformer maakt alle DTO-keys aan, dus `in` zou altijd waar zijn.
    if (dto.employmentType !== undefined) {
      if (!isManagement(actor)) {
        throw new ForbiddenException('U mag de dienstvorm niet wijzigen');
      }
      data.employmentType = dto.employmentType ?? null;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: { organization: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = updated;
    return rest;
  }

  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Alleen PNG, JPEG en WebP afbeeldingen zijn toegestaan');
    }

    const user = assertFound(
      await this.prisma.user.findUnique({ where: { id: userId } }),
      'Gebruiker',
    );

    // Delete old avatar if exists
    if (user.avatarUrl) {
      await this.storage.delete(user.avatarUrl).catch(() => {});
    }

    const ext = sanitizeStorageExtension(file.originalname, 'png');
    const storageKey = `avatars/${userId}/${randomUUID()}.${ext}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: storageKey } });
    return storageKey;
  }

  async downloadAvatar(userId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.avatarUrl) throw new NotFoundException('Geen avatar gevonden');

    const buffer = await this.storage.download(user.avatarUrl);
    const ext = user.avatarUrl.split('.').pop()?.toLowerCase() ?? 'png';
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };
    return { buffer, mimeType: mimeMap[ext] ?? 'image/png' };
  }

  async deleteAvatar(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.avatarUrl) return;
    await this.storage.delete(user.avatarUrl).catch(() => {});
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  }

  async getSignature(userId: string) {
    const user = assertFound(
      await this.prisma.user.findUnique({
        where: { id: userId },
        select: { signatureType: true, signatureData: true },
      }),
      'Gebruiker',
    );
    return { signatureType: user.signatureType, signatureData: user.signatureData };
  }

  async updateSignature(userId: string, dto: UpdateSignatureDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        signatureType: dto.signatureType,
        signatureData: dto.signatureData ?? null,
      },
      select: { signatureType: true, signatureData: true },
    });
  }

  async deleteSignature(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { signatureType: null, signatureData: null },
    });
  }

  // ─── Soft-delete with record transfer ─────────────────

  async getRecordCounts(id: string, currentUser: User) {
    const targetUser = await this.findOne(id);
    this.assertDeletePermission(targetUser, currentUser);

    const [
      contacts,
      requests,
      tasks,
      planningInspectors,
      planningSessionInspectors,
      planningFollowers,
    ] = await Promise.all([
      this.prisma.contact.count({ where: { ownerId: id, isDeleted: false } }),
      this.prisma.request.count({ where: { assignedTo: id, isDeleted: false } }),
      this.prisma.task.count({ where: { assigneeId: id, status: { not: TaskStatus.VOLTOOID } } }),
      this.prisma.planningInspector.count({ where: { userId: id } }),
      this.prisma.planningSessionInspector.count({ where: { userId: id } }),
      this.prisma.planningFollower.count({ where: { userId: id } }),
    ]);

    return {
      contacts,
      requests,
      tasks,
      planningInspectors,
      planningSessionInspectors,
      planningFollowers,
      total: contacts + requests + tasks + planningInspectors + planningSessionInspectors + planningFollowers,
    };
  }

  async softDelete(id: string, transferToUserId: string, currentUser: User) {
    const targetUser = await this.findOne(id);
    this.assertDeletePermission(targetUser, currentUser);

    // Validate transfer target
    const transferTo = await this.prisma.user.findUnique({ where: { id: transferToUserId } });
    if (!transferTo) {
      throw new BadRequestException('Doelgebruiker niet gevonden');
    }
    if (transferTo.isDeleted || !transferTo.isActive) {
      throw new BadRequestException('Doelgebruiker is niet actief');
    }
    if (transferTo.id === id) {
      throw new BadRequestException('Kan records niet overdragen aan dezelfde gebruiker');
    }
    // Tenant isolation for transfer target
    if (targetUser.orgId && transferTo.orgId !== targetUser.orgId) {
      throw new BadRequestException('Doelgebruiker moet in dezelfde organisatie zitten');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Transfer ownership records
      await tx.contact.updateMany({
        where: { ownerId: id, isDeleted: false },
        data: { ownerId: transferToUserId },
      });

      await tx.request.updateMany({
        where: { assignedTo: id, isDeleted: false },
        data: { assignedTo: transferToUserId },
      });

      await tx.task.updateMany({
        where: { assigneeId: id, status: { not: TaskStatus.VOLTOOID } },
        data: { assigneeId: transferToUserId },
      });

      // 2. Transfer planning inspectors (handle unique constraint [planningItemId, userId])
      const existingTargetInspections = await tx.planningInspector.findMany({
        where: { userId: transferToUserId },
        select: { planningItemId: true },
      });
      const targetPlanningIds = new Set(existingTargetInspections.map((i) => i.planningItemId));

      // Delete overlapping assignments (target already assigned)
      if (targetPlanningIds.size > 0) {
        await tx.planningInspector.deleteMany({
          where: {
            userId: id,
            planningItemId: { in: Array.from(targetPlanningIds) },
          },
        });
      }
      // Transfer non-overlapping assignments
      await tx.planningInspector.updateMany({
        where: { userId: id },
        data: { userId: transferToUserId },
      });

      // 3. Transfer planning session inspectors (handle unique constraint [sessionId, userId])
      const existingTargetSessions = await tx.planningSessionInspector.findMany({
        where: { userId: transferToUserId },
        select: { sessionId: true },
      });
      const targetSessionIds = new Set(existingTargetSessions.map((s) => s.sessionId));

      if (targetSessionIds.size > 0) {
        await tx.planningSessionInspector.deleteMany({
          where: {
            userId: id,
            sessionId: { in: Array.from(targetSessionIds) },
          },
        });
      }
      await tx.planningSessionInspector.updateMany({
        where: { userId: id },
        data: { userId: transferToUserId },
      });

      // 4. Transfer planning followers (no unique constraint on userId)
      await tx.planningFollower.updateMany({
        where: { userId: id },
        data: { userId: transferToUserId },
      });

      // 5. Cleanup user-specific records
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.notificationPref.deleteMany({ where: { userId: id } });

      // 6. Revoke all refresh tokens
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 7. Soft-delete the user
      await tx.user.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date(), isActive: false },
      });
    });
  }

  private assertDeletePermission(targetUser: User, currentUser: User) {
    if (targetUser.id === currentUser.id) {
      throw new ForbiddenException('Je kunt je eigen account niet verwijderen');
    }

    if (targetUser.isDeleted) {
      throw new BadRequestException('Gebruiker is al verwijderd');
    }

    // Tenant isolation
    if (
      !currentUser.roles.includes(Role.SUPERUSER) &&
      targetUser.orgId !== currentUser.orgId
    ) {
      throw new ForbiddenException();
    }

    // ORG_ADMIN cannot delete SUPERUSER
    if (
      targetUser.roles.includes(Role.SUPERUSER) &&
      !currentUser.roles.includes(Role.SUPERUSER)
    ) {
      throw new ForbiddenException('Alleen een superuser kan een superuser verwijderen');
    }
  }

  async updateColor(targetUserId: string, color: string | null | undefined, actor: User) {
    const target = await this.findOne(targetUserId);

    // Own profile OR ORG_ADMIN/SUPERUSER
    if (
      actor.id !== targetUserId &&
      !actor.roles.includes(Role.SUPERUSER) &&
      !actor.roles.includes(Role.ORG_ADMIN)
    ) {
      throw new ForbiddenException('Geen bevoegdheid om de kleur van deze gebruiker te wijzigen');
    }

    // Tenant isolation for non-superusers
    if (!actor.roles.includes(Role.SUPERUSER) && target.orgId !== actor.orgId) {
      throw new ForbiddenException();
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { color: color ?? null },
      select: { id: true, color: true },
    });
  }
}
