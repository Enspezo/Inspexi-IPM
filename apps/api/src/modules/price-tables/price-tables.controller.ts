import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
import { PriceTablesService } from './price-tables.service';
import {
  CreatePriceTableDto,
  UpdatePriceTableDto,
  SetPriceTableItemsDto,
  ListPriceTablesQueryDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Price Tables')
@ApiBearerAuth()
@Controller('price-tables')
export class PriceTablesController {
  constructor(private priceTablesService: PriceTablesService) {}

  @Get()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Prijstabellen ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst prijstabellen' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListPriceTablesQueryDto,
  ) {
    const result = await this.priceTablesService.findAll(user, query);
    return { success: true, data: result };
  }

  @Post()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Nieuwe prijstabel aanmaken' })
  @ApiResponse({ status: 201, description: 'Prijstabel aangemaakt' })
  async create(@Body() dto: CreatePriceTableDto, @CurrentUser() user: User) {
    const priceTable = await this.priceTablesService.create(dto, user);
    return { success: true, data: priceTable };
  }

  @Get('for-contact/:contactId')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Prijstabel(len) voor relatie ophalen' })
  @ApiResponse({ status: 200, description: 'Prijstabellen van relatie' })
  async findForContact(
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: User,
  ) {
    const tables = await this.priceTablesService.findForContact(contactId, user);
    return { success: true, data: tables };
  }

  @Get(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Prijstabel detail ophalen' })
  @ApiResponse({ status: 200, description: 'Prijstabel details' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const priceTable = await this.priceTablesService.findOne(id, user);
    return { success: true, data: priceTable };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Prijstabel bijwerken' })
  @ApiResponse({ status: 200, description: 'Prijstabel bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceTableDto,
    @CurrentUser() user: User,
  ) {
    const priceTable = await this.priceTablesService.update(id, dto, user);
    return { success: true, data: priceTable };
  }

  @Put(':id/items')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Producten en prijzen instellen' })
  @ApiResponse({ status: 200, description: 'Items bijgewerkt' })
  async setItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPriceTableItemsDto,
    @CurrentUser() user: User,
  ) {
    const priceTable = await this.priceTablesService.setItems(id, dto, user);
    return { success: true, data: priceTable };
  }

  @Post(':id/assign/:contactId')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Prijstabel aan relatie koppelen' })
  @ApiResponse({ status: 201, description: 'Koppeling aangemaakt' })
  async assignToContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: User,
  ) {
    const result = await this.priceTablesService.assignToContact(id, contactId, user);
    return { success: true, data: result };
  }

  @Delete(':id/assign/:contactId')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Prijstabel ontkoppelen van relatie' })
  @ApiResponse({ status: 200, description: 'Koppeling verwijderd' })
  async removeFromContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: User,
  ) {
    await this.priceTablesService.removeFromContact(id, contactId, user);
    return { success: true, message: 'Koppeling verwijderd' };
  }
}
