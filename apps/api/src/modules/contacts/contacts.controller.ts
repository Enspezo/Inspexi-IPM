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
import { User } from '@prisma/client';
import { CRM_ROLES, OFFICE_ROLES } from '@/common/auth/roles';
import { ContactsService } from './contacts.service';
import { ContactAddressesService } from './contact-addresses.service';
import { ContactPersonsService } from './contact-persons.service';
import { LocationsService } from './locations.service';
import {
  CreateContactDto,
  UpdateContactDto,
  CreateContactAddressDto,
  UpdateContactAddressDto,
  CreateContactPersonDto,
  UpdateContactPersonDto,
  CreateLocationDto,
  UpdateLocationDto,
  CreateContactLogDto,
  SendContactEmailDto,
  ListContactsQueryDto,
  ListContactPersonsQueryDto,
  ListLocationsQueryDto,
  CreateLocationContactPersonDto,
  UpdateLocationContactPersonDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(
    private contactsService: ContactsService,
    private contactAddressesService: ContactAddressesService,
    private contactPersonsService: ContactPersonsService,
    private locationsService: LocationsService,
  ) {}

  @Get()
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Lijst relaties ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst van relaties' })
  async findAll(@CurrentUser() user: User, @Query() query: ListContactsQueryDto) {
    const result = await this.contactsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Get('contact-persons')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Lijst contactpersonen ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst van contactpersonen' })
  async findAllContactPersons(
    @CurrentUser() user: User,
    @Query() query: ListContactPersonsQueryDto,
  ) {
    const result = await this.contactPersonsService.findAllContactPersons(user, query);
    return { success: true, data: result };
  }

  @Get('contact-person-roles')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Lijst contactpersoon-rollen ophalen (lookup)' })
  @ApiResponse({ status: 200, description: 'Lijst van rollen' })
  async findContactPersonRoles(@CurrentUser() user: User) {
    const roles = await this.contactPersonsService.findContactPersonRoles(user);
    return { success: true, data: roles };
  }

  // ─── Locations (global) ─────────────────────────────────

  @Get('locations')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Alle locaties ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst van locaties' })
  async findAllLocations(
    @CurrentUser() user: User,
    @Query() query: ListLocationsQueryDto,
  ) {
    const result = await this.locationsService.findAllLocations(user, query);
    return { success: true, data: result };
  }

  @Get('locations/:locationId')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Locatie detail ophalen' })
  @ApiResponse({ status: 200, description: 'Locatie details' })
  async findLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: User,
  ) {
    const location = await this.locationsService.findLocation(locationId, user);
    return { success: true, data: location };
  }

  @Post()
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Nieuwe relatie aanmaken' })
  @ApiResponse({ status: 201, description: 'Relatie aangemaakt' })
  async create(@Body() dto: CreateContactDto, @CurrentUser() user: User) {
    const contact = await this.contactsService.create(dto, user);
    return { success: true, data: contact };
  }

  @Get(':id')
  @Roles(...CRM_ROLES)
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
  @Roles(...OFFICE_ROLES)
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
  @Roles(...OFFICE_ROLES)
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
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Adres toevoegen aan relatie' })
  @ApiResponse({ status: 201, description: 'Adres toegevoegd' })
  async addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContactAddressDto,
    @CurrentUser() user: User,
  ) {
    const address = await this.contactAddressesService.addAddress(id, dto, user);
    return { success: true, data: address };
  }

  @Patch('addresses/:addressId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Adres bijwerken' })
  @ApiResponse({ status: 200, description: 'Adres bijgewerkt' })
  async updateAddress(
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateContactAddressDto,
    @CurrentUser() user: User,
  ) {
    const address = await this.contactAddressesService.updateAddress(addressId, dto, user);
    return { success: true, data: address };
  }

  @Delete('addresses/:addressId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Adres verwijderen' })
  @ApiResponse({ status: 200, description: 'Adres verwijderd' })
  async deleteAddress(
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @CurrentUser() user: User,
  ) {
    await this.contactAddressesService.deleteAddress(addressId, user);
    return { success: true, message: 'Adres verwijderd' };
  }

  // ─── Nested: Customer Groups Assignment ───────────────

  @Patch(':id/groups')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Klantgroepen van relatie instellen' })
  @ApiResponse({ status: 200, description: 'Klantgroepen bijgewerkt' })
  async setContactGroups(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { groupIds: string[] },
    @CurrentUser() user: User,
  ) {
    const contact = await this.contactsService.setContactGroups(
      id,
      body.groupIds || [],
      user,
    );
    return { success: true, data: contact };
  }

  // ─── Nested: Contact Persons ──────────────────────────

  @Post(':id/contact-persons')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Contactpersoon toevoegen aan relatie' })
  @ApiResponse({ status: 201, description: 'Contactpersoon toegevoegd' })
  async addContactPerson(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContactPersonDto,
    @CurrentUser() user: User,
  ) {
    const person = await this.contactPersonsService.addContactPerson(id, dto, user);
    return { success: true, data: person };
  }

  @Get('contact-persons/:personId/locations')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Gekoppelde locaties van contactpersoon ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst gekoppelde locaties' })
  async findContactPersonLocations(
    @Param('personId', ParseUUIDPipe) personId: string,
    @CurrentUser() user: User,
  ) {
    const links = await this.contactPersonsService.findContactPersonLocations(personId, user);
    return { success: true, data: links };
  }

  @Get('contact-persons/:personId')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Contactpersoon detail ophalen' })
  @ApiResponse({ status: 200, description: 'Contactpersoon details' })
  async findContactPerson(
    @Param('personId', ParseUUIDPipe) personId: string,
    @CurrentUser() user: User,
  ) {
    const person = await this.contactPersonsService.findContactPerson(personId, user);
    return { success: true, data: person };
  }

  @Patch('contact-persons/:personId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Contactpersoon bijwerken' })
  @ApiResponse({ status: 200, description: 'Contactpersoon bijgewerkt' })
  async updateContactPerson(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Body() dto: UpdateContactPersonDto,
    @CurrentUser() user: User,
  ) {
    const person = await this.contactPersonsService.updateContactPerson(personId, dto, user);
    return { success: true, data: person };
  }

  @Delete('contact-persons/:personId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Contactpersoon verwijderen (soft delete)' })
  @ApiResponse({ status: 200, description: 'Contactpersoon verwijderd' })
  async deleteContactPerson(
    @Param('personId', ParseUUIDPipe) personId: string,
    @CurrentUser() user: User,
  ) {
    await this.contactPersonsService.deleteContactPerson(personId, user);
    return { success: true, message: 'Contactpersoon verwijderd' };
  }

  // ─── Location–ContactPerson links ─────────────────────

  @Get('locations/:locationId/contact-persons')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Gekoppelde contactpersonen van locatie ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst gekoppelde contactpersonen' })
  async findLocationContactPersons(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: User,
  ) {
    const links = await this.locationsService.findLocationContactPersons(locationId, user);
    return { success: true, data: links };
  }

  @Post('locations/:locationId/contact-persons')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Contactpersoon koppelen aan locatie' })
  @ApiResponse({ status: 201, description: 'Contactpersoon gekoppeld' })
  async addLocationContactPerson(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateLocationContactPersonDto,
    @CurrentUser() user: User,
  ) {
    const link = await this.locationsService.addLocationContactPerson(locationId, dto, user);
    return { success: true, data: link };
  }

  @Patch('locations/contact-persons/:linkId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Opmerkingen koppeling bijwerken' })
  @ApiResponse({ status: 200, description: 'Koppeling bijgewerkt' })
  async updateLocationContactPerson(
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() dto: UpdateLocationContactPersonDto,
    @CurrentUser() user: User,
  ) {
    const link = await this.locationsService.updateLocationContactPerson(linkId, dto, user);
    return { success: true, data: link };
  }

  @Delete('locations/contact-persons/:linkId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Contactpersoon ontkoppelen van locatie' })
  @ApiResponse({ status: 200, description: 'Contactpersoon ontkoppeld' })
  async removeLocationContactPerson(
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: User,
  ) {
    await this.locationsService.removeLocationContactPerson(linkId, user);
    return { success: true, message: 'Contactpersoon ontkoppeld' };
  }

  // ─── Nested: Locations ─────────────────────────────────

  @Post(':id/locations')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Locatie toevoegen aan relatie' })
  @ApiResponse({ status: 201, description: 'Locatie toegevoegd' })
  async addLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLocationDto,
    @CurrentUser() user: User,
  ) {
    const location = await this.locationsService.addLocation(id, dto, user);
    return { success: true, data: location };
  }

  @Get(':id/locations')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Locaties van relatie ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst locaties' })
  async findLocations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const locations = await this.locationsService.findLocations(id, user);
    return { success: true, data: locations };
  }

  @Patch('locations/:locationId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Locatie bijwerken' })
  @ApiResponse({ status: 200, description: 'Locatie bijgewerkt' })
  async updateLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: User,
  ) {
    const location = await this.locationsService.updateLocation(locationId, dto, user);
    return { success: true, data: location };
  }

  @Delete('locations/:locationId')
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Locatie verwijderen' })
  @ApiResponse({ status: 200, description: 'Locatie verwijderd' })
  async deleteLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: User,
  ) {
    await this.locationsService.deleteLocation(locationId, user);
    return { success: true, message: 'Locatie verwijderd' };
  }

  // ─── Nested: Logs ──────────────────────────────────────

  @Post(':id/logs')
  @Roles(...OFFICE_ROLES)
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
  @Roles(...CRM_ROLES)
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
  @Roles(...OFFICE_ROLES)
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
