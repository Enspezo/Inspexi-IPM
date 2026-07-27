import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF, ORG_ADMINS } from '@/common/auth/roles';
import { DocumentTagsService } from './document-tags.service';
import {
  CreateDocumentTagDto,
  UpdateDocumentTagDto,
  ListDocumentTagsQueryDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';
import { ParseUuidPipe } from '@/common';

@ApiTags('Document Tags')
@ApiBearerAuth()
@RequiresFeature('WORKFLOW_COMPLEET')
@Controller('document-tags')
export class DocumentTagsController {
  constructor(private documentTagsService: DocumentTagsService) {}

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Lijst document-tags ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst van document-tags' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListDocumentTagsQueryDto,
  ) {
    const result = await this.documentTagsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Get('compact')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Compacte lijst document-tags (voor pickers)' })
  async findAllCompact(@CurrentUser() user: User) {
    const data = await this.documentTagsService.findAllCompact(user);
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Document-tag detail ophalen' })
  async findOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const tag = await this.documentTagsService.findOne(id, user);
    return { success: true, data: tag };
  }

  @Post()
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Document-tag aanmaken' })
  @ApiResponse({ status: 201, description: 'Document-tag aangemaakt' })
  async create(
    @Body() dto: CreateDocumentTagDto,
    @CurrentUser() user: User,
  ) {
    const tag = await this.documentTagsService.create(dto, user);
    return { success: true, data: tag };
  }

  @Patch(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Document-tag bijwerken' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateDocumentTagDto,
    @CurrentUser() user: User,
  ) {
    const tag = await this.documentTagsService.update(id, dto, user);
    return { success: true, data: tag };
  }

  @Delete(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Document-tag verwijderen (soft delete)' })
  async remove(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.documentTagsService.softDelete(id, user);
    return { success: true, message: 'Document-tag verwijderd' };
  }
}
