// AI-voorcontrole van inspectierapporten (PRD-13). Geregistreerd in
// app.module.ts. AnthropicModule en EntitlementsModule zijn @Global; de module
// leest InspectionPlan/GeneratedDocument via Prisma (geen import van
// InspectionPlansModule — de submit-hook van fase 3 importeert straks andersom).

import { Module } from '@nestjs/common';
import { AiReviewController } from './ai-review.controller';
import { AiReviewService } from './ai-review.service';
import { AiReviewInputBuilder } from './ai-review-input.builder';

@Module({
  controllers: [AiReviewController],
  providers: [AiReviewService, AiReviewInputBuilder],
  exports: [AiReviewService],
})
export class AiReviewModule {}
