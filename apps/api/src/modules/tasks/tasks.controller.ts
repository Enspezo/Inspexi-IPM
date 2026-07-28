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
import { CRM_ROLES } from '@/common/auth/roles';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, ListTasksQueryDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';
import { ParseUuidPipe } from '@/common';

@ApiTags('Tasks')
@ApiBearerAuth()
@RequiresFeature('BASIS_WORKFLOW')
@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  @Roles(...CRM_ROLES)
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
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Taak detail ophalen' })
  @ApiResponse({ status: 200, description: 'Taak details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const task = await this.tasksService.findOne(id, user);
    return { success: true, data: task };
  }

  @Post()
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Nieuwe taak aanmaken' })
  @ApiResponse({ status: 201, description: 'Taak aangemaakt' })
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: User) {
    const task = await this.tasksService.create(dto, user);
    return { success: true, data: task };
  }

  @Patch(':id')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Taak bijwerken' })
  @ApiResponse({ status: 200, description: 'Taak bijgewerkt' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: User,
  ) {
    const task = await this.tasksService.update(id, dto, user);
    return { success: true, data: task };
  }

  @Delete(':id')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Taak verwijderen' })
  @ApiResponse({ status: 200, description: 'Taak verwijderd' })
  async remove(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.tasksService.remove(id, user);
    return { success: true, message: 'Taak verwijderd' };
  }
}
