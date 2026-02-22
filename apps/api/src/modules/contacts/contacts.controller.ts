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
import { User, Role } from '@prisma/client';
import { ContactsService } from './contacts.service';
import {
  CreateContactDto,
  UpdateContactDto,
  CreateContactAddressDto,
  CreateLocationDto,
  CreateContactLogDto,
  SendContactEmailDto,
  ListContactsQueryDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Get()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Lijst relaties ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst van relaties' })
  async findAll(@CurrentUser() user: User, @Query() query: ListContactsQueryDto) {
    const result = await this.contactsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Post()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Nieuwe relatie aanmaken' })
  @ApiResponse({ status: 201, description: 'Relatie aangemaakt' })
  async create(@Body() dto: CreateContactDto, @CurrentUser() user: User) {
    const contact = await this.contactsService.create(dto, user);
    return { success: true, data: contact };
  }

  @Get(':id')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Relatie detail ophalen' })
  @ApiResponse({ status: 200, description: 'Relatie details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const contact = await this.contactsService.findOne(id, user);
    return { success: true, data: contact };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Relatie bijwerken' })
  @ApiResponse({ status: 200, description: 'Relatie bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: User,
  ) {
    const contact = await this.contactsService.update(id, dto, user);
    return { success: true, data: contact };
  }

  @Delete(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Relatie verwijderen (soft delete)' })
  @ApiResponse({ status: 200, description: 'Relatie verwijderd' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.contactsService.softDelete(id, user);
    return { success: true, message: 'Relatie verwijderd' };
  }

  // ─── Nested: Addresses ─────────────────────────────────

  @Post(':id/addresses')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Adres toevoegen aan relatie' })
  @ApiResponse({ status: 201, description: 'Adres toegevoegd' })
  async addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContactAddressDto,
    @CurrentUser() user: User,
  ) {
    const address = await this.contactsService.addAddress(id, dto, user);
    return { success: true, data: address };
  }

  // ─── Nested: Locations ─────────────────────────────────

  @Post(':id/locations')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Locatie toevoegen aan relatie' })
  @ApiResponse({ status: 201, description: 'Locatie toegevoegd' })
  async addLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLocationDto,
    @CurrentUser() user: User,
  ) {
    const location = await this.contactsService.addLocation(id, dto, user);
    return { success: true, data: location };
  }

  @Get(':id/locations')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Locaties van relatie ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst locaties' })
  async findLocations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const locations = await this.contactsService.findLocations(id, user);
    return { success: true, data: locations };
  }

  // ─── Nested: Logs ──────────────────────────────────────

  @Post(':id/logs')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Contactmoment loggen' })
  @ApiResponse({ status: 201, description: 'Contactmoment gelogd' })
  async addLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContactLogDto,
    @CurrentUser() user: User,
  ) {
    const log = await this.contactsService.addLog(id, dto, user);
    return { success: true, data: log };
  }

  @Get(':id/logs')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Contactgeschiedenis ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst contactmomenten' })
  async findLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const logs = await this.contactsService.findLogs(id, user);
    return { success: true, data: logs };
  }

  // ─── Nested: Email ─────────────────────────────────────

  @Post(':id/email')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Email versturen naar relatie' })
  @ApiResponse({ status: 201, description: 'Email verstuurd' })
  async sendEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendContactEmailDto,
    @CurrentUser() user: User,
  ) {
    const email = await this.contactsService.sendEmail(id, dto, user);
    return { success: true, data: email };
  }
}
