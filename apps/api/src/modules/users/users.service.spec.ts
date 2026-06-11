import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role, User } from '@prisma/client';
import { UsersService } from './users.service';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockOrganization = {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    logoUrl: null,
    primaryColor: null,
    defaultVat: 21,
    defaultValidityDays: 30,
    createdAt: new Date('2025-01-01'),
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Admin',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockSuperuser = {
    id: 'user-super',
    orgId: null,
    email: 'superuser@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Super',
    lastName: 'User',
    roles: [Role.SUPERUSER],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    invitation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEmailService = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendInvitation: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        PUBLIC_URL: 'https://app.inspexi.nl',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: STORAGE_PROVIDER,
          useValue: {
            upload: jest.fn(),
            download: jest.fn(),
            delete: jest.fn(),
            exists: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAllByOrg()', () => {
    it('should return users for given org', async () => {
      const users = [
        { ...mockUser, organization: mockOrganization },
        {
          ...mockUser,
          id: 'user-2',
          email: 'user2@test.com',
          organization: mockOrganization,
        },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(users);

      const result = await service.findAllByOrg('org-1', false);

      expect(result).toEqual(users);
      expect(result).toHaveLength(2);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1', isDeleted: false },
        include: { organization: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return all users when SUPERUSER queries without orgId', async () => {
      const allUsers = [
        { ...mockUser, organization: mockOrganization },
        { ...mockSuperuser, organization: null },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(allUsers);

      const result = await service.findAllByOrg(null, true);

      expect(result).toEqual(allUsers);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
        include: { organization: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('invite()', () => {
    const inviteDto = {
      email: 'new@test.com',
      role: Role.BACKOFFICE,
    };

    it('should create invitation and send email', async () => {
      const invitation = {
        id: 'inv-1',
        orgId: 'org-1',
        email: inviteDto.email,
        role: inviteDto.role,
        token: 'inv-token-abc',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: null,
        createdAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.invitation.findFirst.mockResolvedValue(null);
      mockPrismaService.invitation.create.mockResolvedValue(invitation);
      mockPrismaService.organization.findUnique.mockResolvedValue(
        mockOrganization,
      );

      const result = await service.invite('org-1', inviteDto, mockUser);

      expect(result).toEqual(invitation);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: inviteDto.email },
      });
      expect(mockPrismaService.invitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org-1',
          email: inviteDto.email,
          role: inviteDto.role,
          expiresAt: expect.any(Date),
        }),
      });
      expect(mockEmailService.sendInvitation).toHaveBeenCalledWith(
        inviteDto.email,
        expect.stringContaining('https://app.inspexi.nl/invite/'),
        mockOrganization.name,
        inviteDto.role,
        'org-1',
      );
    });

    it('should throw ConflictException if user exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.invite('org-1', inviteDto, mockUser),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.invite('org-1', inviteDto, mockUser),
      ).rejects.toThrow('Er bestaat al een gebruiker met dit e-mailadres');
    });

    it('should throw ForbiddenException if ORG_ADMIN tries to invite SUPERUSER', async () => {
      const superuserInviteDto = {
        email: 'super@test.com',
        role: Role.SUPERUSER,
      };

      await expect(
        service.invite('org-1', superuserInviteDto, mockUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.invite('org-1', superuserInviteDto, mockUser),
      ).rejects.toThrow(
        'Alleen een superuser kan een superuser uitnodigen',
      );
    });

    it('should throw BadRequestException when orgId is null', async () => {
      await expect(
        service.invite(null, inviteDto, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.invite(null, inviteDto, mockUser),
      ).rejects.toThrow('Organisatie is vereist voor uitnodigingen');
    });
  });

  describe('acceptInvitation()', () => {
    const acceptDto = {
      token: 'inv-token-abc',
      password: 'NewPassword123!',
      firstName: 'New',
      lastName: 'User',
    };

    const mockInvitation = {
      id: 'inv-1',
      orgId: 'org-1',
      email: 'new@test.com',
      role: Role.BACKOFFICE,
      token: 'inv-token-abc',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      acceptedAt: null,
      createdAt: new Date('2025-01-01'),
    };

    it('should create user from valid invitation', async () => {
      const createdUser = {
        id: 'user-new',
        orgId: mockInvitation.orgId,
        email: mockInvitation.email,
        passwordHash: '$2b$10$newhashedpassword',
        firstName: acceptDto.firstName,
        lastName: acceptDto.lastName,
        roles: [mockInvitation.role],
        isActive: true,
        emailVerifiedAt: expect.any(Date),
        createdAt: new Date(),
      };

      mockPrismaService.invitation.findUnique.mockResolvedValue(
        mockInvitation,
      );
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhashedpassword');
      mockPrismaService.$transaction.mockResolvedValue([
        createdUser,
        { ...mockInvitation, acceptedAt: new Date() },
      ]);

      const result = await service.acceptInvitation(acceptDto);

      expect(result).not.toHaveProperty('passwordHash');
      expect(mockPrismaService.invitation.findUnique).toHaveBeenCalledWith({
        where: { token: acceptDto.token },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(acceptDto.password, 10);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      // Verify user.create was called with correct data
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: mockInvitation.orgId,
          email: mockInvitation.email,
          passwordHash: '$2b$10$newhashedpassword',
          firstName: acceptDto.firstName,
          lastName: acceptDto.lastName,
          roles: [mockInvitation.role],
        }),
      });
      // Verify invitation.update was called
      expect(mockPrismaService.invitation.update).toHaveBeenCalledWith({
        where: { id: mockInvitation.id },
        data: { acceptedAt: expect.any(Date) },
      });
    });

    it('should throw for expired invitation', async () => {
      const expiredInvitation = {
        ...mockInvitation,
        expiresAt: new Date('2024-01-01'), // in the past
      };
      mockPrismaService.invitation.findUnique.mockResolvedValue(
        expiredInvitation,
      );

      await expect(service.acceptInvitation(acceptDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.acceptInvitation(acceptDto)).rejects.toThrow(
        'Uitnodiging is verlopen',
      );
    });

    it('should throw for already-accepted invitation', async () => {
      const acceptedInvitation = {
        ...mockInvitation,
        acceptedAt: new Date('2025-01-15'),
      };
      mockPrismaService.invitation.findUnique.mockResolvedValue(
        acceptedInvitation,
      );

      await expect(service.acceptInvitation(acceptDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.acceptInvitation(acceptDto)).rejects.toThrow(
        'Uitnodiging is al geaccepteerd',
      );
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvitation(acceptDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.acceptInvitation(acceptDto)).rejects.toThrow(
        'Ongeldige uitnodiging',
      );
    });
  });

  describe('deactivate()', () => {
    it('should set isActive to false', async () => {
      const targetUser = {
        ...mockUser,
        id: 'user-2',
        organization: mockOrganization,
      };

      // findOne calls findUnique
      mockPrismaService.user.findUnique.mockResolvedValue(targetUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...targetUser,
        isActive: false,
      });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.deactivate('user-2', mockUser);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { isActive: false },
      });
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-2', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should throw if deactivating self', async () => {
      await expect(
        service.deactivate('user-1', mockUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.deactivate('user-1', mockUser),
      ).rejects.toThrow(
        'Je kunt je eigen account niet deactiveren',
      );
    });
  });

  describe('changeRole()', () => {
    it('should update roles', async () => {
      const targetUser = {
        ...mockUser,
        id: 'user-2',
        roles: [Role.BACKOFFICE],
        organization: mockOrganization,
      };
      const changeRoleDto = { roles: [Role.MANAGER] };

      mockPrismaService.user.findUnique.mockResolvedValue(targetUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...targetUser,
        roles: [Role.MANAGER],
      });

      await service.changeRole('user-2', changeRoleDto, mockUser);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { roles: [Role.MANAGER] },
      });
    });

    it('should throw if ORG_ADMIN sets SUPERUSER', async () => {
      const targetUser = {
        ...mockUser,
        id: 'user-2',
        roles: [Role.BACKOFFICE],
        organization: mockOrganization,
      };
      const changeRoleDto = { roles: [Role.SUPERUSER] };

      mockPrismaService.user.findUnique.mockResolvedValue(targetUser);

      await expect(
        service.changeRole('user-2', changeRoleDto, mockUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.changeRole('user-2', changeRoleDto, mockUser),
      ).rejects.toThrow(
        'Alleen een superuser kan de superuser rol toewijzen',
      );
    });

    it('should throw if changing own role', async () => {
      const changeRoleDto = { roles: [Role.MANAGER] };

      await expect(
        service.changeRole('user-1', changeRoleDto, mockUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.changeRole('user-1', changeRoleDto, mockUser),
      ).rejects.toThrow('Je kunt je eigen rol niet wijzigen');
    });
  });

  describe('updateProfile()', () => {
    it('should update first and last name', async () => {
      const updateDto = { firstName: 'Updated', lastName: 'Name' };
      const updatedUser = {
        ...mockUser,
        firstName: 'Updated',
        lastName: 'Name',
        organization: mockOrganization,
      };

      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile('user-1', updateDto);

      expect(result.firstName).toBe('Updated');
      expect(result.lastName).toBe('Name');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { firstName: 'Updated', lastName: 'Name' },
        include: { organization: true },
      });
    });

    it('should throw ConflictException when email is already in use', async () => {
      const updateDto = { email: 'taken@test.com' };

      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-other',
        email: 'taken@test.com',
      });

      await expect(
        service.updateProfile('user-1', updateDto),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.updateProfile('user-1', updateDto),
      ).rejects.toThrow('E-mailadres is al in gebruik');
    });

    it('should update email and reset emailVerifiedAt', async () => {
      const updateDto = { email: 'new@test.com' };
      const updatedUser = {
        ...mockUser,
        email: 'new@test.com',
        emailVerifiedAt: null,
        organization: mockOrganization,
      };

      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile('user-1', updateDto);

      expect(result.email).toBe('new@test.com');
      expect(result.emailVerifiedAt).toBeNull();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          email: 'new@test.com',
          emailVerifiedAt: null,
        },
        include: { organization: true },
      });
    });
  });
});
