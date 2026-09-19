import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '@/prisma';
import { Public } from '@/common/decorators';

// Unauthenticated liveness/readiness probe for load balancers and orchestrators
// (DEP-3). @Public so it needs no JWT and no org subdomain; it performs a light
// `SELECT 1` so a probe also catches a lost database connection.
//
// F2 (staging-review): a lost DB connection answers 503 — load balancers and
// orchestrators key on the HTTP status, not on the body, so a 200 with
// `status:'degraded'` would keep routing traffic to a broken instance.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness/readiness probe (DB connectivity; 503 when the DB is down)' })
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'degraded', database: 'down' };
    }
  }
}
