// @Public() (staf-guards uit) + ClientJwtAuthGuard + @CurrentTenant (org-subdomein).
// Berichten hangen onder een inspectie: /client/inspections/:id/messages.

import { Controller, Get, Post, Param, Body, UseGuards} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import {
  CurrentClientUser,
  type CurrentClientUserData,
} from '@/common/decorators/current-client-user.decorator';
import { ClientMessagesService } from './client-messages.service';
import { SendMessageDto } from './dto';
import { ParseUuidPipe } from '@/common';

@ApiTags('Client Messages')
@Public()
@UseGuards(ClientJwtAuthGuard)
@RequiresFeature('BASIS_INSPECTIES')
@Controller('client/inspections')
export class ClientMessagesController {
  constructor(private readonly service: ClientMessagesService) {}

  @Get(':id/messages')
  @ApiOperation({ summary: 'Berichten van een inspectie (klant)' })
  async list(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.getMessages(user, orgId, id) };
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Bericht plaatsen bij een inspectie (klant)' })
  async send(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.sendMessage(user, orgId, id, dto.content) };
  }

  @Post(':id/messages/:messageId/read')
  @ApiOperation({ summary: 'Staf-bericht als gelezen markeren' })
  async markRead(
    @Param('id', ParseUuidPipe) id: string,
    @Param('messageId', ParseUuidPipe) messageId: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.markRead(user, orgId, id, messageId) };
  }
}
