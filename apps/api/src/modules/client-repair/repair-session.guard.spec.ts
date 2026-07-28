// Herstelsessie-guard (PRD-14 §14.6): token-validatie, lazy expiry, org-match
// via het subdomein en het bijwerken van lastActivityAt.
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RepairSessionStatus } from '@prisma/client';
import { RepairSessionGuard } from './repair-session.guard';
import { PrismaService } from '@/prisma';
import { REPAIR_SESSION_EXPIRED_ERROR } from '@/common';

describe('RepairSessionGuard', () => {
  let guard: RepairSessionGuard;

  const mockPrisma = {
    repairSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const createContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    }) as unknown as ExecutionContext;

  const buildRequest = (authorization?: string, tenantOrgId?: string | null) => ({
    headers: authorization ? { authorization } : {},
    tenant: tenantOrgId === undefined ? undefined : { orgId: tenantOrgId },
  });

  const activeSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'sess-1',
    orgId: 'org-1',
    token: 'tok-123',
    status: RepairSessionStatus.ACTIVE,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RepairSessionGuard, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    guard = module.get<RepairSessionGuard>(RepairSessionGuard);

    // De fire-and-forget updates (expiry-flip + lastActivityAt) resolven default.
    mockPrisma.repairSession.update.mockResolvedValue({});
  });

  it('weigert zonder Authorization-header', async () => {
    await expect(guard.canActivate(createContext(buildRequest()))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockPrisma.repairSession.findUnique).not.toHaveBeenCalled();
  });

  it('weigert een naked token zonder Bearer-prefix', async () => {
    await expect(
      guard.canActivate(createContext(buildRequest('tok-123'))),
    ).rejects.toThrow('Geen herstelsessie-token meegegeven');
    expect(mockPrisma.repairSession.findUnique).not.toHaveBeenCalled();
  });

  it('weigert een onbekend token met de sessie-verlopen-melding', async () => {
    mockPrisma.repairSession.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext(buildRequest('Bearer onbekend'))),
    ).rejects.toMatchObject({ message: REPAIR_SESSION_EXPIRED_ERROR });
    expect(mockPrisma.repairSession.findUnique).toHaveBeenCalledWith({
      where: { token: 'onbekend' },
    });
  });

  it('weigert een sessie met status EXPIRED', async () => {
    mockPrisma.repairSession.findUnique.mockResolvedValue(
      activeSession({ status: RepairSessionStatus.EXPIRED }),
    );

    await expect(
      guard.canActivate(createContext(buildRequest('Bearer tok-123'))),
    ).rejects.toMatchObject({ message: REPAIR_SESSION_EXPIRED_ERROR });
    expect(mockPrisma.repairSession.update).not.toHaveBeenCalled();
  });

  it('lazy expiry: verlopen expiresAt → weigering + sessie op EXPIRED gezet', async () => {
    mockPrisma.repairSession.findUnique.mockResolvedValue(
      activeSession({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      guard.canActivate(createContext(buildRequest('Bearer tok-123'))),
    ).rejects.toMatchObject({ message: REPAIR_SESSION_EXPIRED_ERROR });

    expect(mockPrisma.repairSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { status: RepairSessionStatus.EXPIRED },
    });
  });

  it('weigert een sessie van een andere org dan het subdomein (tenant-mismatch)', async () => {
    mockPrisma.repairSession.findUnique.mockResolvedValue(activeSession());

    await expect(
      guard.canActivate(createContext(buildRequest('Bearer tok-123', 'org-2'))),
    ).rejects.toThrow('Ongeldige herstelsessie');
  });

  it('happy path: hangt de sessie op de request en werkt lastActivityAt bij', async () => {
    const session = activeSession();
    mockPrisma.repairSession.findUnique.mockResolvedValue(session);
    const request = buildRequest('Bearer tok-123', 'org-1') as any;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.repairSession).toBe(session);
    expect(mockPrisma.repairSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { lastActivityAt: expect.any(Date) },
    });
  });

  it('laat een request zonder tenant-org door (unknown host, bv. E2E op 127.0.0.1)', async () => {
    mockPrisma.repairSession.findUnique.mockResolvedValue(activeSession());

    await expect(
      guard.canActivate(createContext(buildRequest('Bearer tok-123', null))),
    ).resolves.toBe(true);
  });

  it('laat een COMPLETED-sessie met toekomstige expiry door (bevestigingsscherm/PDF)', async () => {
    mockPrisma.repairSession.findUnique.mockResolvedValue(
      activeSession({ status: RepairSessionStatus.COMPLETED }),
    );

    await expect(
      guard.canActivate(createContext(buildRequest('Bearer tok-123', 'org-1'))),
    ).resolves.toBe(true);
  });

  it('lazy expiry geldt alléén voor ACTIVE: een COMPLETED-sessie ná de TTL blijft toegestaan zonder status-flip (review #8)', async () => {
    mockPrisma.repairSession.findUnique.mockResolvedValue(
      activeSession({
        status: RepairSessionStatus.COMPLETED,
        expiresAt: new Date(Date.now() - 1000),
      }),
    );

    await expect(
      guard.canActivate(createContext(buildRequest('Bearer tok-123', 'org-1'))),
    ).resolves.toBe(true);

    // Geen EXPIRED-flip; alleen de gebruikelijke lastActivityAt-update.
    expect(mockPrisma.repairSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: RepairSessionStatus.EXPIRED } }),
    );
    expect(mockPrisma.repairSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { lastActivityAt: expect.any(Date) },
    });
  });
});
