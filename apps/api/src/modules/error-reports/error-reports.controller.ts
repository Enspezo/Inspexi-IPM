import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ErrorReportsService } from './error-reports.service';
import {
  CreateErrorReportDto,
  ListErrorReportsQueryDto,
  UpdateErrorReportStatusDto,
} from './dto';

@ApiTags('Error Reports')
@ApiBearerAuth()
@Controller('error-reports')
export class ErrorReportsController {
  constructor(private readonly errorReportsService: ErrorReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit an error report' })
  @Roles(...ALL_STAFF)
  async create(
    @Body() dto: CreateErrorReportDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.errorReportsService.create(dto, user);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'List all error reports (superuser only)' })
  @Roles(Role.SUPERUSER)
  async findAll(@Query() query: ListErrorReportsQueryDto) {
    const data = await this.errorReportsService.findAll(query);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single error report (superuser only)' })
  @Roles(Role.SUPERUSER)
  async findOne(@Param('id') id: string) {
    const data = await this.errorReportsService.findOne(id);
    return { success: true, data };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update error report status (superuser only)' })
  @Roles(Role.SUPERUSER)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateErrorReportStatusDto,
  ) {
    const data = await this.errorReportsService.updateStatus(id, dto);
    return { success: true, data };
  }
}
