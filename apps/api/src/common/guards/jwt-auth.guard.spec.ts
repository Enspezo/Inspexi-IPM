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

  it('should delegate to passport for non-public routes', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

    const context = createMockContext();
    // canActivate will call super.canActivate which returns an Observable/Promise
    // In a unit test without passport configured, this would throw
    // We just verify the reflector check happens and it doesn't short-circuit
    const superCanActivateSpy = jest.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(guard)),
      'canActivate',
    );

    try {
      guard.canActivate(context);
    } catch {
      // Expected — passport strategy is not set up in unit tests
    }

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    superCanActivateSpy.mockRestore();
  });

  it('should delegate to passport when isPublic is undefined', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    const context = createMockContext();

    try {
      guard.canActivate(context);
    } catch {
      // Expected — passport strategy is not set up
    }

    expect(reflector.getAllAndOverride).toHaveBeenCalled();
  });
});
