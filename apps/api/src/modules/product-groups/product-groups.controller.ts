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
import { CRM_ROLES, ORG_ADMINS } from '@/common/auth/roles';
import { ProductGroupsService } from './product-groups.service';
import {
  CreateProductGroupDto,
  UpdateProductGroupDto,
  ListProductGroupsQueryDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';
import { ParseUuidPipe } from '@/common';

@ApiTags('Product Groups')
@ApiBearerAuth()
@RequiresFeature('CRM_COMPLEET')
@Controller('product-groups')
export class ProductGroupsController {
  constructor(private productGroupsService: ProductGroupsService) {}

  @Get()
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Lijst productgroepen ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst van productgroepen' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListProductGroupsQueryDto,
  ) {
    const result = await this.productGroupsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Get('compact')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Compacte lijst productgroepen (voor dropdowns)' })
  async findAllCompact(@CurrentUser() user: User) {
    const data = await this.productGroupsService.findAllCompact(user);
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Productgroep detail ophalen' })
  async findOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const group = await this.productGroupsService.findOne(id, user);
    return { success: true, data: group };
  }

  @Post()
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Productgroep aanmaken' })
  @ApiResponse({ status: 201, description: 'Productgroep aangemaakt' })
  async create(
    @Body() dto: CreateProductGroupDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.productGroupsService.create(dto, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Productgroep bijwerken' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateProductGroupDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.productGroupsService.update(id, dto, user);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Productgroep verwijderen (soft delete)' })
  async remove(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.productGroupsService.softDelete(id, user);
    return { success: true, message: 'Productgroep verwijderd' };
  }

  // ─── Product koppeling ───────────────────────────────────

  @Post(':id/products')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Product toevoegen aan productgroep' })
  async addProduct(
    @Param('id', ParseUuidPipe) id: string,
    @Body() body: { productId: string },
    @CurrentUser() user: User,
  ) {
    const data = await this.productGroupsService.addProduct(id, body.productId, user);
    return { success: true, data };
  }

  @Delete(':id/products/:productId')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Product verwijderen uit productgroep' })
  async removeProduct(
    @Param('id', ParseUuidPipe) id: string,
    @Param('productId', ParseUuidPipe) productId: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.productGroupsService.removeProduct(id, productId, user);
    return { success: true, data };
  }
}
