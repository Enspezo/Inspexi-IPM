// @Public() (staf-guards uit) + ClientJwtAuthGuard + @CurrentTenant (org-subdomein).
// GET :id (detail) · GET :id/download (auth-stream) · POST :id/sign (DocumentSignature).

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Res,
  Ip,
  StreamableFile,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import {
  CurrentClientUser,
  type CurrentClientUserData,
} from '@/common/decorators/current-client-user.decorator';
import { ClientDocumentsService } from './client-documents.service';
import { ClientSignDocumentDto } from './dto';
import { ParseUuidPipe } from '@/common';

@ApiTags('Client Documents')
@Public()
@UseGuards(ClientJwtAuthGuard)
@RequiresFeature('BASIS_INSPECTIES')
@Controller('client/documents')
export class ClientDocumentsController {
  constructor(private readonly service: ClientDocumentsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Document-detail met HTML-preview (klant)' })
  async detail(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.getDetail(user, orgId, id) };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Document-PDF downloaden (org + ClientAccess gescoped)' })
  async download(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType, filename } = await this.service.download(user, orgId, id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Document ondertekenen als klant' })
  async sign(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: ClientSignDocumentDto,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
    @Ip() ip: string,
  ) {
    return { success: true, data: await this.service.sign(user, orgId, id, dto, ip) };
  }
}
