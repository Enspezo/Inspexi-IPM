import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { FavoritesService } from './favorites.service';
import { FavoriteKeyDto, ListFavoritesQueryDto } from './dto';

@ApiTags('Favorites')
@ApiBearerAuth()
@RequiresFeature('BASIS_WORKFLOW')
@Controller('favorites')
export class FavoritesController {
  constructor(private favoritesService: FavoritesService) {}

  @Post()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Record als favoriet markeren (idempotent)' })
  async add(@Body() dto: FavoriteKeyDto, @CurrentUser() user: User) {
    const data = await this.favoritesService.add(dto, user);
    return { success: true, data };
  }

  @Delete()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Favoriet verwijderen (idempotent)' })
  async remove(@Query() dto: FavoriteKeyDto, @CurrentUser() user: User) {
    await this.favoritesService.remove(dto, user);
    return { success: true, message: 'Favoriet verwijderd' };
  }

  // NOTE: declared before any param routes to keep the static path explicit.
  @Get('keys')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Favoriet-sleutels ophalen (entityType + entityId)' })
  async getKeys(@CurrentUser() user: User) {
    const data = await this.favoritesService.getKeys(user);
    return { success: true, data };
  }

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Favorieten ophalen, gegroepeerd per entiteitstype' })
  async list(@Query() query: ListFavoritesQueryDto, @CurrentUser() user: User) {
    const data = await this.favoritesService.list(user, query);
    return { success: true, data };
  }
}
