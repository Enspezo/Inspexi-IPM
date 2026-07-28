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

  it('retries on the next batch when the alert dispatch itself fails', async () => {
    dispatchSpy.mockRejectedValueOnce(new Error('notify failed') as never);

    // First batch: dispatch fails -> no cooldown set, state left for retry
    await failNTimes(5);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    // Let the rejected dispatch promise settle (clears the in-flight guard)
    await Promise.resolve();

    // Next failure crosses the (still-full) window again -> immediate retry
    await failNTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
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

/**
 * PRD-12: audit-attributie. `source` is de laatste geïnterpoleerde waarde in de
 * INSERT-template (vóór het literale NOW()), dus we lezen die uit de raw-call.
 */
describe('PrismaService writeAuditLog — source attribution (PRD-12)', () => {
  let service: PrismaService;
  let rawSpy: jest.SpyInstance;

  const base = {
    entityType: 'Contact',
    entityId: '00000000-0000-0000-0000-000000000001',
    action: 'CREATE',
    snapshot: null,
    changes: null,
    userId: '00000000-0000-0000-0000-000000000002',
    orgId: '00000000-0000-0000-0000-000000000003',
  };

  /** Laatste `${}`-waarde uit de eerste $executeRaw-call = het source-argument. */
  const insertedSource = () => {
    const args = rawSpy.mock.calls[0];
    return args[args.length - 1];
  };

  beforeEach(() => {
    service = new PrismaService();
    jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    rawSpy = jest.spyOn(service, '$executeRaw').mockResolvedValue(1 as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("defaults source to 'HUMAN' when not provided", async () => {
    await service.writeAuditLog({ ...base });
    expect(rawSpy).toHaveBeenCalledTimes(1);
    expect(insertedSource()).toBe('HUMAN');
  });

  it("stamps source 'AI' when the context is AI-initiated", async () => {
    await service.writeAuditLog({ ...base, source: 'AI' });
    expect(insertedSource()).toBe('AI');
  });

  it("keeps 'HUMAN' when explicitly set", async () => {
    await service.writeAuditLog({ ...base, source: 'HUMAN' });
    expect(insertedSource()).toBe('HUMAN');
  });
});
