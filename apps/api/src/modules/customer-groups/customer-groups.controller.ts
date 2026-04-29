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
import { CustomerGroupsService } from './customer-groups.service';
import {
  CreateCustomerGroupDto,
  UpdateCustomerGroupDto,
  ListCustomerGroupsQueryDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Customer Groups')
@ApiBearerAuth()
@Controller('customer-groups')
export class CustomerGroupsController {
  constructor(private customerGroupsService: CustomerGroupsService) {}

  @Get()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Lijst klantgroepen ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst van klantgroepen' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListCustomerGroupsQueryDto,
  ) {
    const result = await this.customerGroupsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Get('compact')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Compacte lijst klantgroepen (voor dropdowns)' })
  async findAllCompact(@CurrentUser() user: User) {
    const data = await this.customerGroupsService.findAllCompact(user);
    return { success: true, data };
  }

  @Get(':id')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Klantgroep detail ophalen' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const group = await this.customerGroupsService.findOne(id, user);
    return { success: true, data: group };
  }

  @Post()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Klantgroep aanmaken' })
  @ApiResponse({ status: 201, description: 'Klantgroep aangemaakt' })
  async create(
    @Body() dto: CreateCustomerGroupDto,
    @CurrentUser() user: User,
  ) {
    const group = await this.customerGroupsService.create(dto, user);
    return { success: true, data: group };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Klantgroep bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerGroupDto,
    @CurrentUser() user: User,
  ) {
    const group = await this.customerGroupsService.update(id, dto, user);
    return { success: true, data: group };
  }

  @Delete(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Klantgroep verwijderen (soft delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.customerGroupsService.softDelete(id, user);
    return { success: true, message: 'Klantgroep verwijderd' };
  }

  // ─── Contact toewijzing ─────────────────────────────────

  @Post(':id/contacts')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Relatie toevoegen aan klantgroep' })
  @ApiResponse({ status: 201, description: 'Relatie toegevoegd aan groep' })
  async addContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { contactId: string },
    @CurrentUser() user: User,
  ) {
    const group = await this.customerGroupsService.addContact(
      id,
      body.contactId,
      user,
    );
    return { success: true, data: group };
  }

  @Delete(':id/contacts/:contactId')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Relatie verwijderen uit klantgroep' })
  @ApiResponse({ status: 200, description: 'Relatie verwijderd uit groep' })
  async removeContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: User,
  ) {
    const group = await this.customerGroupsService.removeContact(
      id,
      contactId,
      user,
    );
    return { success: true, data: group };
  }
}
