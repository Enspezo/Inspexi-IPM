import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, NoteEntityType } from '@prisma/client';
import { NotesService } from './notes.service';
import { CreateNoteDto, UpdateNoteDto, ListNotesQueryDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';
import { CRM_ROLES } from '@/common/auth/roles';

const crmRoles = CRM_ROLES;

@ApiTags('Notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  constructor(private notesService: NotesService) {}

  @Get()
  @Roles(...crmRoles)
  @ApiOperation({ summary: 'Notities ophalen (overzicht, gepagineerd, root notes)' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst notities' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListNotesQueryDto,
  ) {
    const result = await this.notesService.findAll(user, query);
    return { success: true, data: result };
  }

  // NOTE: This route must be declared BEFORE /:id to avoid route conflict
  @Get('by-entity')
  @Roles(...crmRoles)
  @ApiOperation({ summary: 'Notities ophalen per entiteit (threaded)' })
  @ApiResponse({ status: 200, description: 'Threaded notities voor een entiteit' })
  async findByEntity(
    @CurrentUser() user: User,
    @Query('entityType') entityType: NoteEntityType,
    @Query('entityId') entityId: string,
  ) {
    const notes = await this.notesService.findByEntity(entityType, entityId, user);
    return { success: true, data: notes };
  }

  @Get(':id')
  @Roles(...crmRoles)
  @ApiOperation({ summary: 'Notitie detail ophalen' })
  @ApiResponse({ status: 200, description: 'Notitie details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const note = await this.notesService.findOne(id, user);
    return { success: true, data: note };
  }

  @Post()
  @Roles(...crmRoles)
  @ApiOperation({ summary: 'Nieuwe notitie aanmaken' })
  @ApiResponse({ status: 201, description: 'Notitie aangemaakt' })
  async create(@Body() dto: CreateNoteDto, @CurrentUser() user: User) {
    const note = await this.notesService.create(dto, user);
    return { success: true, data: note };
  }

  @Patch(':id')
  @Roles(...crmRoles)
  @ApiOperation({ summary: 'Notitie bijwerken (alleen aanmaker, ORG_ADMIN of SUPERUSER)' })
  @ApiResponse({ status: 200, description: 'Notitie bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
    @CurrentUser() user: User,
  ) {
    const note = await this.notesService.update(id, dto, user);
    return { success: true, data: note };
  }

  @Delete(':id')
  @Roles(...crmRoles)
  @ApiOperation({ summary: 'Notitie verwijderen (soft delete, alleen aanmaker, ORG_ADMIN of SUPERUSER)' })
  @ApiResponse({ status: 200, description: 'Notitie verwijderd' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.notesService.remove(id, user);
    return { success: true, message: 'Notitie verwijderd' };
  }
}
