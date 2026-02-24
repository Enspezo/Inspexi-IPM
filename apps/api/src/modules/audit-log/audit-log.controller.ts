import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get(':entityType/:entityId')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'List audit logs for an entity' })
  async findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Query() query: ListAuditLogsQueryDto,
    @CurrentUser() user: User,
  ) {
    const orgId = user.role === Role.SUPERUSER ? null : user.orgId;
    const result = await this.auditLogService.findByEntity(
      entityType,
      entityId,
      orgId,
      { page: query.page ?? 1, limit: query.limit ?? 20 },
    );

    return {
      success: true,
      data: result,
    };
  }
}
