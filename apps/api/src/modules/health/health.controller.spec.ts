import { HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const res = () => ({ status: jest.fn() }) as any;

  it('returns ok/up (200) when the database answers', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any;
    const r = res();
    await expect(new HealthController(prisma).check(r)).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
    expect(r.status).not.toHaveBeenCalled();
  });

  it('F2: returns degraded/down with HTTP 503 when the database is unreachable', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) } as any;
    const r = res();
    await expect(new HealthController(prisma).check(r)).resolves.toEqual({
      status: 'degraded',
      database: 'down',
    });
    expect(r.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
