import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
    Role.INSPECTEUR,
  )
  @ApiOperation({ summary: 'Eigen notificaties ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst notificaties' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const result = await this.notificationsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Get('unread-count')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
    Role.INSPECTEUR,
  )
  @ApiOperation({ summary: 'Aantal ongelezen notificaties' })
  @ApiResponse({ status: 200, description: 'Ongelezen telling' })
  async getUnreadCount(@CurrentUser() user: User) {
    const data = await this.notificationsService.getUnreadCount(user);
    return { success: true, data };
  }

  @Patch(':id/read')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
    Role.INSPECTEUR,
  )
  @ApiOperation({ summary: 'Notificatie als gelezen markeren' })
  @ApiResponse({ status: 200, description: 'Notificatie bijgewerkt' })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.notificationsService.markRead(id, user);
    return { success: true, data };
  }

  @Post('read-all')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
    Role.INSPECTEUR,
  )
  @ApiOperation({ summary: 'Alle notificaties als gelezen markeren' })
  @ApiResponse({ status: 200, description: 'Alle notificaties gelezen' })
  async markAllRead(@CurrentUser() user: User) {
    await this.notificationsService.markAllRead(user);
    return { success: true, message: 'Alle notificaties gelezen' };
  }
}
