import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
        getResponse: jest.fn().mockReturnValue({}),
        getNext: jest.fn(),
      }),
    }) as unknown as ExecutionContext;

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true for routes decorated with @Public()', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

    const context = createMockContext();
    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  it('should delegate to passport for non-public routes', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

    const context = createMockContext();
    // canActivate calls super.canActivate which returns a Promise.
    // In a unit test the 'jwt' passport strategy is not registered,
    // so the promise rejects — we just verify the reflector check
    // happens and the guard does not short-circuit to `true`.
    await expect(
      Promise.resolve(guard.canActivate(context) as Promise<boolean>),
    ).rejects.toThrow();

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  it('should delegate to passport when isPublic is undefined', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    const context = createMockContext();

    await expect(
      Promise.resolve(guard.canActivate(context) as Promise<boolean>),
    ).rejects.toThrow();

    expect(reflector.getAllAndOverride).toHaveBeenCalled();
  });
});
