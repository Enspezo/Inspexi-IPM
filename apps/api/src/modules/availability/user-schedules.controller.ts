import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF, MANAGEMENT_ROLES } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { UserSchedulesService } from './user-schedules.service';
import { AssignScheduleDto } from './dto';

@ApiTags('User schedules')
@ApiBearerAuth()
@Controller('availability/users')
export class UserSchedulesController {
  constructor(private readonly service: UserSchedulesService) {}

  // Lezen: alle staf; de service beperkt een INSPECTEUR tot het eigen schema.
  @Get(':userId/schedule')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Schema-toewijzingen van een inspecteur (actueel + historisch)' })
  @ApiResponse({ status: 200, description: 'Lijst toewijzingen' })
  async getSchedule(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.getSchedule(userId, user);
    return { success: true, data };
  }

  @Put(':userId/schedule')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Weekschema toewijzen (sluit de lopende toewijzing af op validFrom)' })
  @ApiResponse({ status: 200, description: 'Toewijzing aangemaakt' })
  async assign(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignScheduleDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.assign(userId, user, dto);
    return { success: true, data };
  }

  @Delete(':userId/schedule/:assignmentId')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Toekomstige schema-toewijzing verwijderen' })
  @ApiResponse({ status: 200, description: 'Toewijzing verwijderd' })
  @ApiResponse({ status: 400, description: 'Alleen toekomstige toewijzingen kunnen worden verwijderd' })
  async remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() user: User,
  ) {
    await this.service.remove(userId, assignmentId, user);
    return { success: true, message: 'Toewijzing verwijderd' };
  }
}
