import { PrismaService } from './prisma.service';

/**
 * Unit tests for the audit-failure alerting path in PrismaService.
 * The alert path is in-memory (single process) and fire-and-forget.
 */
describe('PrismaService audit-failure alerting', () => {
  let service: PrismaService;
  let dispatchSpy: jest.SpyInstance;

  const auditPayload = {
    entityType: 'Contact',
    entityId: '00000000-0000-0000-0000-000000000001',
    action: 'CREATE',
    snapshot: null,
    changes: null,
    userId: '00000000-0000-0000-0000-000000000002',
    orgId: '00000000-0000-0000-0000-000000000003',
  };

  /** Trigger N audit-write failures by forcing $executeRaw to reject. */
  async function failNTimes(n: number) {
    for (let i = 0; i < n; i++) {
      await service.writeAuditLog({ ...auditPayload });
    }
  }

  beforeEach(() => {
    service = new PrismaService();
    // Silence logger noise
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    // Force every audit write to fail
    jest
      .spyOn(service, '$executeRaw')
      .mockRejectedValue(new Error('db down') as never);
    // Spy on the actual notification dispatch so we can count alerts
    dispatchSpy = jest
      .spyOn(service as any, 'dispatchAuditFailureAlert')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does not alert when failures stay below the threshold', async () => {
    await failNTimes(4);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('alerts exactly once when the threshold is reached', async () => {
    await failNTimes(5);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(5);
  });

  it('suppresses repeat alerts during the cooldown period', async () => {
    // First batch crosses the threshold -> 1 alert
    await failNTimes(5);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Another full batch immediately after -> still within cooldown, no new alert
    await failNTimes(5);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('alerts again after the cooldown window elapses', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-12T10:00:00Z'));

    await failNTimes(5);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Advance past the 60 minute cooldown
    jest.setSystemTime(new Date('2026-06-12T11:01:00Z'));

    await failNTimes(5);
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
  });
});
