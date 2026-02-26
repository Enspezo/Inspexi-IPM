import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User, Role } from '@prisma/client';
import { PrismaService } from '@/prisma';
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
} from './dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private config: ConfigService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  async findAllByOrg(orgId: string | null, currentUserRole: Role) {
    if (currentUserRole === Role.SUPERUSER) {
      return this.prisma.user.findMany({
        where: orgId ? { orgId } : undefined,
        include: { organization: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!orgId) {
      throw new ForbiddenException();
    }

    return this.prisma.user.findMany({
      where: { orgId },
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { organization: true },
    });
    if (!user) {
      throw new NotFoundException('Gebruiker niet gevonden');
    }
    return user;
  }

  async invite(orgId: string | null, dto: InviteUserDto, invitedBy: User) {
    if (!orgId) {
      throw new BadRequestException('Organisatie is vereist voor uitnodigingen');
    }

    // Check role hierarchy
    if (dto.role === Role.SUPERUSER && invitedBy.role !== Role.SUPERUSER) {
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

    await this.emailService.sendInvitation(
      dto.email,
      inviteUrl,
      org?.name || 'InspeXi',
      dto.role,
    );

    return invitation;
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
          role: invitation.role,
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
      currentUser.role !== Role.SUPERUSER &&
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
      currentUser.role !== Role.SUPERUSER &&
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
      currentUser.role !== Role.SUPERUSER &&
      user.orgId !== currentUser.orgId
    ) {
      throw new ForbiddenException();
    }

    // Check role hierarchy
    if (
      dto.role === Role.SUPERUSER &&
      currentUser.role !== Role.SUPERUSER
    ) {
      throw new ForbiddenException(
        'Alleen een superuser kan de superuser rol toewijzen',
      );
    }

    await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
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
      currentUser.role !== Role.SUPERUSER &&
      user.orgId !== currentUser.orgId
    ) {
      throw new ForbiddenException();
    }

    // ORG_ADMIN mag geen andere ORG_ADMIN of SUPERUSER resetten
    if (
      currentUser.role === Role.ORG_ADMIN &&
      (user.role === Role.SUPERUSER || user.role === Role.ORG_ADMIN)
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

    return this.prisma.user.update({
      where: { id },
      data,
      include: { organization: true },
    });
  }

  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Alleen PNG, JPEG en WebP afbeeldingen zijn toegestaan');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Gebruiker niet gevonden');

    // Delete old avatar if exists
    if (user.avatarUrl) {
      await this.storage.delete(user.avatarUrl).catch(() => {});
    }

    const ext = file.originalname.split('.').pop() ?? 'png';
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
}
