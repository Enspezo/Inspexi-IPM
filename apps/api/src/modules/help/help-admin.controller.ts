import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ORG_ADMINS } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { HelpService } from './help.service';
import {
  CreateHelpCategoryDto,
  UpdateHelpCategoryDto,
  CreateHelpArticleDto,
  UpdateHelpArticleDto,
  ListHelpArticlesDto,
} from './dto';

@ApiTags('Help (beheer)')
@ApiBearerAuth()
@Roles(...ORG_ADMINS) // SUPERUSER (globaal) + ORG_ADMIN (eigen org)
@Controller('help/admin')
export class HelpAdminController {
  constructor(private help: HelpService) {}

  // Categorieën
  @Post('categories')
  async createCategory(
    @CurrentUser() user: User,
    @Body() dto: CreateHelpCategoryDto,
  ) {
    return { success: true, data: await this.help.createCategory(user, dto) };
  }

  @Patch('categories/:id')
  async updateCategory(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHelpCategoryDto,
  ) {
    return { success: true, data: await this.help.updateCategory(user, id, dto) };
  }

  @Delete('categories/:id')
  async deleteCategory(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { success: true, data: await this.help.deleteCategory(user, id) };
  }

  // Artikelen
  @Get('articles')
  @ApiOperation({ summary: 'Artikelen incl. concepten (binnen scope)' })
  async listArticles(@CurrentUser() user: User, @Query() q: ListHelpArticlesDto) {
    return { success: true, data: await this.help.adminListArticles(user, q) };
  }

  @Post('articles')
  async createArticle(
    @CurrentUser() user: User,
    @Body() dto: CreateHelpArticleDto,
  ) {
    return { success: true, data: await this.help.createArticle(user, dto) };
  }

  @Patch('articles/:id')
  async updateArticle(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHelpArticleDto,
  ) {
    return { success: true, data: await this.help.updateArticle(user, id, dto) };
  }

  @Post('articles/:id/publish')
  async publishArticle(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { success: true, data: await this.help.publishArticle(user, id) };
  }

  @Delete('articles/:id')
  async deleteArticle(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { success: true, data: await this.help.deleteArticle(user, id) };
  }
}
