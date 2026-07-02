import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '@/prisma';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;
  const findUnique = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    const config = { get: () => 'test-secret' } as unknown as ConfigService;
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    strategy = new JwtStrategy(config, prisma);
  });

  const accessPayload = {
    sub: 'user-1',
    email: 'a@b.nl',
    roles: [Role.ORG_ADMIN],
    orgId: 'org-1',
    type: 'access' as const,
  };

  it('accepts a valid access token and returns the user', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', isActive: true, organization: {} });
    await expect(strategy.validate(accessPayload)).resolves.toMatchObject({ id: 'user-1' });
  });

  it('rejects a token without type: "access" (e.g. a reset token)', async () => {
    // Reset/verify tokens are signed with the same JWT_SECRET but carry a
    // `purpose` claim and no `type: 'access'` — they must not authenticate.
    const resetLike = {
      sub: 'user-1',
      email: 'a@b.nl',
      purpose: 'password-reset',
    } as unknown as typeof accessPayload;

    await expect(strategy.validate(resetLike)).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate(resetLike)).rejects.toThrow('Ongeldig token-type');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects an inactive/absent user even with a valid access token', async () => {
    findUnique.mockResolvedValue(null);
    await expect(strategy.validate(accessPayload)).rejects.toThrow(UnauthorizedException);
  });
});
