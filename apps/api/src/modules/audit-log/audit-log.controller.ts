import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { ALL_STAFF, OFFICE_ROLES } from '@/common/auth/roles';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto, ListMyActivityQueryDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';
import { ParseUuidPipe } from '@/common';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@RequiresFeature('WORKFLOW_COMPLEET')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('me')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'List my audit log activity' })
  async findMyActivity(
    @Query() query: ListMyActivityQueryDto,
    @CurrentUser() user: User,
  ) {
    const orgId = user.roles.includes(Role.SUPERUSER) ? null : user.orgId;
    const result = await this.auditLogService.findByUser(user.id, orgId, {
      entityType: query.entityType,
      action: query.action,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      success: true,
      data: result,
    };
  }

  @Get(':entityType/:entityId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'List audit logs for an entity' })
  async findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUuidPipe) entityId: string,
    @Query() query: ListAuditLogsQueryDto,
    @CurrentUser() user: User,
  ) {
    const orgId = user.roles.includes(Role.SUPERUSER) ? null : user.orgId;
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
