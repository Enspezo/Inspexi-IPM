import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockContext = (user?: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('no roles decorator', () => {
    it('should allow access when no roles are required', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      const context = createMockContext({ roles: [Role.INSPECTEUR] });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when roles array is empty', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);

      const context = createMockContext({ roles: [Role.INSPECTEUR] });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('with required roles', () => {
    it('should allow access when user has the required role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ORG_ADMIN]);

      const context = createMockContext({ roles: [Role.ORG_ADMIN] });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.ORG_ADMIN,
        Role.MANAGER,
      ]);

      const context = createMockContext({ roles: [Role.MANAGER] });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access when user does not have the required role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ORG_ADMIN]);

      const context = createMockContext({ roles: [Role.INSPECTEUR] });
      expect(guard.canActivate(context)).toBe(false);
    });

    it('should allow SUPERUSER when SUPERUSER is in required roles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.SUPERUSER,
        Role.ORG_ADMIN,
      ]);

      const context = createMockContext({ roles: [Role.SUPERUSER] });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access when user object is missing', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ORG_ADMIN]);

      const context = createMockContext(undefined);
      expect(guard.canActivate(context)).toBe(false);
    });

    it('should deny access when user is null', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ORG_ADMIN]);

      const context = createMockContext(null);
      expect(guard.canActivate(context)).toBe(false);
    });

    it('should deny access when user has no matching roles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.SUPERUSER,
        Role.ORG_ADMIN,
      ]);

      const context = createMockContext({ roles: [Role.BACKOFFICE, Role.INSPECTEUR] });
      expect(guard.canActivate(context)).toBe(false);
    });

    it('should allow user with multiple roles when one matches', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.MANAGER]);

      const context = createMockContext({
        roles: [Role.BACKOFFICE, Role.MANAGER],
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
