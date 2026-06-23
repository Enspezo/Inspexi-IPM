import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto';
import { Roles, CurrentUser, Public } from '@/common/decorators';

@ApiTags('Notifications')
@ApiBearerAuth()
@RequiresFeature('BASIS_WORKFLOW')
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @Roles(...ALL_STAFF)
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
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Aantal ongelezen notificaties' })
  @ApiResponse({ status: 200, description: 'Ongelezen telling' })
  async getUnreadCount(@CurrentUser() user: User) {
    const data = await this.notificationsService.getUnreadCount(user);
    return { success: true, data };
  }

  @Patch(':id/read')
  @Roles(...ALL_STAFF)
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
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Alle notificaties als gelezen markeren' })
  @ApiResponse({ status: 200, description: 'Alle notificaties gelezen' })
  async markAllRead(@CurrentUser() user: User) {
    await this.notificationsService.markAllRead(user);
    return { success: true, message: 'Alle notificaties gelezen' };
  }

  @Public()
  @Get('unsubscribe')
  @ApiOperation({ summary: 'Afmelden voor e-mailnotificaties via token' })
  @ApiResponse({ status: 200, description: 'Succesvol afgemeld' })
  @ApiResponse({ status: 400, description: 'Ongeldige of verlopen token' })
  async unsubscribe(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    await this.notificationsService.processUnsubscribe(token);
    // Return a simple HTML confirmation page
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>Afgemeld</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#374151}
h1{color:#111827}p{color:#6B7280}</style>
</head>
<body>
<h1>✅ U bent afgemeld</h1>
<p>U ontvangt geen e-mailnotificaties meer van InspeXi Beheer.</p>
<p>U kunt uw voorkeuren op elk moment aanpassen in uw profielinstellingen.</p>
</body>
</html>`);
  }
}
