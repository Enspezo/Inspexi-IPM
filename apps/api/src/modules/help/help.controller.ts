import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { HelpService } from './help.service';
import { ListHelpArticlesDto, HelpFeedbackDto } from './dto';

@ApiTags('Help')
@ApiBearerAuth()
@Controller('help')
export class HelpController {
  constructor(private help: HelpService) {}

  @Get('categories')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Zichtbare KB-categorieën' })
  async categories(@CurrentUser() user: User) {
    return { success: true, data: await this.help.listCategories(user) };
  }

  @Get('categories/:slug')
  @Roles(...ALL_STAFF)
  async category(@CurrentUser() user: User, @Param('slug') slug: string) {
    return { success: true, data: await this.help.getCategoryBySlug(user, slug) };
  }

  @Get('articles')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Gepubliceerde artikelen (gefilterd op zichtbaarheid)' })
  async articles(@CurrentUser() user: User, @Query() q: ListHelpArticlesDto) {
    return { success: true, data: await this.help.listArticles(user, q) };
  }

  @Get('articles/:slug')
  @Roles(...ALL_STAFF)
  async article(@CurrentUser() user: User, @Param('slug') slug: string) {
    return { success: true, data: await this.help.getArticleBySlug(user, slug) };
  }

  @Post('articles/:id/feedback')
  @Roles(...ALL_STAFF)
  async feedback(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HelpFeedbackDto,
  ) {
    return {
      success: true,
      data: await this.help.giveFeedback(user, id, dto.helpful),
    };
  }
}
