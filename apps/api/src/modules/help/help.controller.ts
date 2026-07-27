import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { HelpService } from './help.service';
import { ListHelpArticlesDto, HelpFeedbackDto, ContextualHelpDto } from './dto';
import { ParseUuidPipe } from '@/common';

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

  // Vóór articles/:slug zodat "contextual" niet als slug wordt opgevat.
  @Get('articles/contextual')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Contextuele KB-suggesties voor de huidige view' })
  async contextual(@CurrentUser() user: User, @Query() q: ContextualHelpDto) {
    const data = await this.help.getContextual(user, q.module, q.q, q.limit ?? 20);
    return { success: true, data };
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
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: HelpFeedbackDto,
  ) {
    return {
      success: true,
      data: await this.help.giveFeedback(user, id, dto.helpful),
    };
  }
}
