import {
  Controller,
  Get,
  Post,
  Patch,
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
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, ListProductsQueryDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';
import { ParseUuidPipe } from '@/common';

@ApiTags('Products')
@ApiBearerAuth()
@RequiresFeature('CRM_COMPLEET')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Productcatalogus ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst producten' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListProductsQueryDto,
  ) {
    const result = await this.productsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Product detail ophalen' })
  @ApiResponse({ status: 200, description: 'Product gevonden' })
  async findOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const product = await this.productsService.findOne(id, user);
    return { success: true, data: product };
  }

  @Post()
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Nieuw product aanmaken' })
  @ApiResponse({ status: 201, description: 'Product aangemaakt' })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: User) {
    const product = await this.productsService.create(dto, user);
    return { success: true, data: product };
  }

  @Patch(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Product bijwerken' })
  @ApiResponse({ status: 200, description: 'Product bijgewerkt' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: User,
  ) {
    const product = await this.productsService.update(id, dto, user);
    return { success: true, data: product };
  }
}
