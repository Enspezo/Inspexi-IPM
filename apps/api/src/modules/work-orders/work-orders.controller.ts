import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF, CRM_ROLES, MANAGEMENT_ROLES } from '@/common/auth/roles';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { WorkOrdersService } from './work-orders.service';
import {
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusDto,
  SetWorkOrderLinesDto,
  ListWorkOrdersQueryDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

@ApiTags('work-orders')
@RequiresFeature('UITVOERING_COMPLEET')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly service: WorkOrdersService) {}

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Lijst van werkbonnen' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListWorkOrdersQueryDto,
  ) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Werkbon aanmaken' })
  async create(@CurrentUser() user: User, @Body() dto: CreateWorkOrderDto) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  // Specific routes BEFORE generic :id routes to avoid NestJS route conflicts
  @Patch(':id/status')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Werkbon status wijzigen' })
  async updateStatus(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateWorkOrderStatusDto,
  ) {
    const data = await this.service.updateStatus(id, dto, user);
    return { success: true, data };
  }

  @Put(':id/lines')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Werkbon meerwerk regels instellen' })
  async setLines(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: SetWorkOrderLinesDto,
  ) {
    const data = await this.service.setLines(id, dto, user);
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Werkbon details' })
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Werkbon bijwerken' })
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Werkbon verwijderen' })
  async remove(
    @CurrentUser() user: User,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    await this.service.remove(id, user);
    return { success: true };
  }
}
