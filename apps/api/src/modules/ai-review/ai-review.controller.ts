// API-ontwerp PRD-13 §13.7. De /inspection-plans/:id/ai-review-routes leven
// bewust hiér (niet in inspection-plans.controller.ts): de feature-gate is
// AI_REVIEW i.p.v. BASIS_INSPECTIES en de module blijft zo losgekoppeld.
// Segment-aantallen verschillen van `GET inspection-plans/:id`, dus er is geen
// route-volgorde-conflict met de bestaande controller.

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ALL_STAFF, REVIEW_ROLES } from '@/common/auth/roles';
import { AiReviewService } from './ai-review.service';
import { UpdateAiReviewItemDto } from './dto';

@ApiTags('ai-review')
@ApiBearerAuth()
@Controller()
export class AiReviewController {
  constructor(private readonly service: AiReviewService) {}

  @Get('ai-review/status')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Is de AI-voorcontrole beschikbaar? (geen feature-gate — voor de org-settings-UI)' })
  @ApiResponse({ status: 200, description: 'Beschikbaarheid + geconfigureerd model' })
  status() {
    return { success: true, data: this.service.status() };
  }

  @Get('inspection-plans/:id/ai-review')
  @RequiresFeature('AI_REVIEW')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Laatste AI-review-run (incl. items) van een inspectieplan' })
  @ApiQuery({ name: 'all', required: false, description: 'true → alle runs (nieuwste eerst)' })
  @ApiResponse({ status: 200, description: 'Laatste run of null; met ?all=true een lijst' })
  @ApiResponse({ status: 404, description: 'Inspectieplan niet gevonden' })
  async getForPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query('all') all?: string,
  ) {
    return { success: true, data: await this.service.getForPlan(id, user, all === 'true') };
  }

  @Post('inspection-plans/:id/ai-review')
  @HttpCode(HttpStatus.CREATED)
  @RequiresFeature('AI_REVIEW')
  @Roles(...REVIEW_ROLES)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Handmatige (her)run van de AI-voorcontrole' })
  @ApiResponse({ status: 201, description: 'Run gestart (PENDING); analyse draait asynchroon' })
  @ApiResponse({ status: 400, description: 'AI-voorcontrole staat uit voor deze organisatie' })
  @ApiResponse({ status: 409, description: 'Er draait al een AI-analyse voor dit plan' })
  @ApiResponse({ status: 503, description: 'AI-dienst niet geconfigureerd' })
  async startRun(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.startRun(id, user) };
  }

  @Patch('ai-review-items/:id')
  @RequiresFeature('AI_REVIEW')
  @Roles(...REVIEW_ROLES)
  @ApiOperation({ summary: 'AI-review-item afvinken, afwijzen of heropenen' })
  @ApiResponse({ status: 200, description: 'Item bijgewerkt' })
  @ApiResponse({ status: 404, description: 'AI-review-item niet gevonden' })
  async updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAiReviewItemDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.updateItemStatus(id, dto.status, user) };
  }
}
