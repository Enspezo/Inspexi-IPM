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
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, ListTasksQueryDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Taken ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst taken' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListTasksQueryDto,
  ) {
    const result = await this.tasksService.findAll(user, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Taak detail ophalen' })
  @ApiResponse({ status: 200, description: 'Taak details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const task = await this.tasksService.findOne(id, user);
    return { success: true, data: task };
  }

  @Post()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Nieuwe taak aanmaken' })
  @ApiResponse({ status: 201, description: 'Taak aangemaakt' })
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: User) {
    const task = await this.tasksService.create(dto, user);
    return { success: true, data: task };
  }

  @Patch(':id')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Taak bijwerken' })
  @ApiResponse({ status: 200, description: 'Taak bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: User,
  ) {
    const task = await this.tasksService.update(id, dto, user);
    return { success: true, data: task };
  }

  @Delete(':id')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Taak verwijderen' })
  @ApiResponse({ status: 200, description: 'Taak verwijderd' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.tasksService.remove(id, user);
    return { success: true, message: 'Taak verwijderd' };
  }
}
