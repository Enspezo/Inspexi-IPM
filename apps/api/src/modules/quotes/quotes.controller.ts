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
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User, Role, QuoteStatus } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { QuotesService } from './quotes.service';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  SetQuoteLinesDto,
  ListQuotesQueryDto,
  SubmitApprovalDto,
  ApproveQuoteDto,
  RejectQuoteDto,
} from './dto';

@ApiTags('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Get('resolve-price')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async resolvePrice(
    @CurrentUser() user: User,
    @Query('productId', ParseUUIDPipe) productId: string,
    @Query('contactId', ParseUUIDPipe) contactId: string,
    @Query('quantity') quantity: string,
  ) {
    const data = await this.service.resolvePrice(
      productId,
      contactId,
      parseFloat(quantity) || 1,
      user,
    );
    return { success: true, data };
  }

  @Get()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListQuotesQueryDto,
  ) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async create(@CurrentUser() user: User, @Body() dto: CreateQuoteDto) {
    const data = await this.service.create(dto, user);
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
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  @Put(':id/lines')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async setLines(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetQuoteLinesDto,
  ) {
    const data = await this.service.setLines(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/status')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async updateStatus(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: QuoteStatus,
  ) {
    const data = await this.service.updateStatus(id, status, user);
    return { success: true, data };
  }

  @Post(':id/submit-approval')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  async submitForApproval(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitApprovalDto,
  ) {
    const data = await this.service.submitForApproval(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/approve')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER)
  async approve(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveQuoteDto,
  ) {
    const data = await this.service.approve(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/reject')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER)
  async reject(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectQuoteDto,
  ) {
    const data = await this.service.reject(id, dto, user);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER)
  async remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.remove(id, user);
    return { success: true, data };
  }
}
