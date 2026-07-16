import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@/prisma';
import { Public } from '@/common/decorators';

// Unauthenticated liveness/readiness probe for load balancers and orchestrators
// (DEP-3). @Public so it needs no JWT and no org subdomain; it performs a light
// `SELECT 1` so a probe also catches a lost database connection.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness/readiness probe (DB connectivity)' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'degraded', database: 'down' };
    }
  }
}
