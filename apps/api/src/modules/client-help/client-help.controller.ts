// Externe kennisbank voor het klantportaal. @Public() zet de staf-guards uit; de
// org komt uit het subdomein (@CurrentTenant). Publieke routes hebben géén
// ClientJwtAuthGuard; afgeschermde routes wél. Specifieke routes vóór param-routes.

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import { ClientHelpService } from './client-help.service';

@ApiTags('Client Help')
@Public()
@Controller('client/help')
export class ClientHelpController {
  constructor(private readonly service: ClientHelpService) {}

  // ── Publiek (zonder login): alleen publieke categorieën ──────────────────
  @Get('public/categories')
  @ApiOperation({ summary: 'Publieke externe KB-categorieën (zonder login)' })
  async publicCategories(@CurrentTenant('orgId') orgId: string | null) {
    return { success: true, data: await this.service.listCategories(orgId, true) };
  }

  @Get('public/articles/:slug')
  @ApiOperation({ summary: 'Publiek extern KB-artikel (zonder login)' })
  async publicArticle(
    @CurrentTenant('orgId') orgId: string | null,
    @Param('slug') slug: string,
  ) {
    return {
      success: true,
      data: await this.service.getArticleBySlug(orgId, slug, true),
    };
  }

  // ── Ingelogd (ClientUser): alle externe categorieën van de org ───────────
  @Get('categories')
  @UseGuards(ClientJwtAuthGuard)
  @ApiOperation({ summary: 'Externe KB-categorieën (na klant-login)' })
  async categories(@CurrentTenant('orgId') orgId: string | null) {
    return { success: true, data: await this.service.listCategories(orgId, false) };
  }

  @Get('articles/:slug')
  @UseGuards(ClientJwtAuthGuard)
  @ApiOperation({ summary: 'Extern KB-artikel (na klant-login)' })
  async article(
    @CurrentTenant('orgId') orgId: string | null,
    @Param('slug') slug: string,
  ) {
    return {
      success: true,
      data: await this.service.getArticleBySlug(orgId, slug, false),
    };
  }
}
