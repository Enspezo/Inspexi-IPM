import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';

// Mock uuid to return a deterministic value
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-token'),
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'test@example.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Test',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
    organization: {
      id: 'org-1',
      name: 'Test Org',
      slug: 'test-org',
      logoUrl: null,
      primaryColor: null,
      defaultVat: 21,
      defaultValidityDays: 30,
      createdAt: new Date('2025-01-01'),
    },
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-access-token'),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_EXPIRATION: '30d',
        PUBLIC_URL: 'https://app.inspexi.nl',
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockEmailService = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendInvitation: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('login()', () => {
    const loginDto = { email: 'test@example.com', password: 'Password123!' };

    it('should return tokens for valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        id: 'rt-1',
        userId: mockUser.id,
        tokenHash: 'hashed',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      });

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-uuid-token');
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.passwordHash,
      );
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        roles: mockUser.roles,
        orgId: mockUser.orgId,
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
      // Expired/old revoked tokens are cleaned up after login
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: mockUser.id,
        }),
      });
    });

    it('persists a 30-day remember-me token by default', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.login(loginDto);

      expect(result.remember).toBe(true);
      const { data } = mockPrismaService.refreshToken.create.mock.calls[0][0];
      expect(data.rememberMe).toBe(true);
      // ~30 days out (allow a little slack for test runtime)
      const ms = data.expiresAt.getTime() - Date.now();
      expect(ms).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    });

    it('issues a short-lived session token when remember is false', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.login({ ...loginDto, remember: false });

      expect(result.remember).toBe(false);
      const { data } = mockPrismaService.refreshToken.create.mock.calls[0][0];
      expect(data.rememberMe).toBe(false);
      // 12h short session — well under a day
      const ms = data.expiresAt.getTime() - Date.now();
      expect(ms).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Ongeldige inloggegevens',
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Ongeldige inloggegevens',
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockPrismaService.user.findUnique.mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Account is gedeactiveerd',
      );
    });
  });

  describe('refresh()', () => {
    const rawRefreshToken = 'raw-refresh-token-value';

    it('should return new tokens for valid refresh token', async () => {
      const storedToken = {
        id: 'rt-1',
        userId: mockUser.id,
        tokenHash: 'stored-hash',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        revokedAt: null,
        ipAddress: null,
        userAgent: null,
        user: mockUser,
      };

      mockPrismaService.refreshToken.findFirst.mockResolvedValue(storedToken);
      mockPrismaService.refreshToken.delete.mockResolvedValue(storedToken);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        id: 'rt-2',
        userId: mockUser.id,
        tokenHash: 'new-hash',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      });

      const result = await service.refresh(rawRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessToken).toBe('mock-access-token');

      // Verify old token was hard-deleted on rotation
      expect(mockPrismaService.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: storedToken.id },
      });

      // Verify new refresh token was created
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('should throw for expired token (not found)', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh(rawRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refresh(rawRefreshToken)).rejects.toThrow(
        'Ongeldige of verlopen refresh token',
      );
    });
  });

  describe('logout()', () => {
    it('should call updateMany to revoke token', async () => {
      const rawRefreshToken = 'raw-refresh-token-value';
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(rawRefreshToken);

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash: expect.any(String),
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('getMe()', () => {
    it('should return user without passwordHash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe('user-1');

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('id', 'user-1');
      expect(result).toHaveProperty('email', 'test@example.com');
      expect(result).toHaveProperty('firstName', 'Test');
      expect(result).toHaveProperty('lastName', 'User');
      expect(result).toHaveProperty('organization');
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        include: { organization: true },
      });
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('non-existent')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.getMe('non-existent')).rejects.toThrow(
        'Gebruiker niet gevonden',
      );
    });
  });
});
