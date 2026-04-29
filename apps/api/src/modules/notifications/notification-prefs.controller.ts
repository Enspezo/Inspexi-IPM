import {
  Controller,
  Get,
  Put,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { SavePrefsDto, SaveGroupPrefsDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@Controller('notification-prefs')
export class NotificationPrefsController {
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
  @ApiOperation({ summary: 'Eigen notificatievoorkeuren ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst met voorkeuren' })
  async getOwnPrefs(@CurrentUser() user: User) {
    const data = await this.notificationsService.getOwnPrefs(user);
    return { success: true, data };
  }

  @Put()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
    Role.INSPECTEUR,
  )
  @ApiOperation({ summary: 'Eigen notificatievoorkeuren opslaan' })
  @ApiResponse({ status: 200, description: 'Voorkeuren bijgewerkt' })
  async saveOwnPrefs(
    @CurrentUser() user: User,
    @Body() dto: SavePrefsDto,
  ) {
    const data = await this.notificationsService.saveOwnPrefs(user, dto);
    return { success: true, data };
  }

  @Get('group')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Groepsnotificatievoorkeuren ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst met groepsvoorkeuren' })
  async getGroupPrefs(@CurrentUser() user: User) {
    const data = await this.notificationsService.getGroupPrefs(user);
    return { success: true, data };
  }

  @Put('group')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Groepsnotificatievoorkeuren opslaan' })
  @ApiResponse({ status: 200, description: 'Groepsvoorkeuren bijgewerkt' })
  async saveGroupPrefs(
    @CurrentUser() user: User,
    @Body() dto: SaveGroupPrefsDto,
  ) {
    const data = await this.notificationsService.saveGroupPrefs(user, dto);
    return { success: true, data };
  }
}
