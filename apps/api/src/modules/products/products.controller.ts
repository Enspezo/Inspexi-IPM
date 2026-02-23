import {
  Controller,
  Get,
  Post,
  Patch,
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
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, ListProductsQueryDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER)
  @ApiOperation({ summary: 'Productcatalogus ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst producten' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListProductsQueryDto,
  ) {
    const result = await this.productsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Post()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Nieuw product aanmaken' })
  @ApiResponse({ status: 201, description: 'Product aangemaakt' })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: User) {
    const product = await this.productsService.create(dto, user);
    return { success: true, data: product };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Product bijwerken' })
  @ApiResponse({ status: 200, description: 'Product bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: User,
  ) {
    const product = await this.productsService.update(id, dto, user);
    return { success: true, data: product };
  }
}
