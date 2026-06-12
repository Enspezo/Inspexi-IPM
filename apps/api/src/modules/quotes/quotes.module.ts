import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuotesController, PublicQuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuoteApprovalsService } from './quote-approvals.service';
import { QuoteQuestionsService } from './quote-questions.service';
import { QuoteAttachmentsService } from './quote-attachments.service';
import { QuotePdfService } from './quote-pdf.service';
import { QuotePublicService } from './quote-public.service';
import { QuoteSchedulerService } from './quote-scheduler.service';
import { PdfService } from './pdf.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PlanningModule } from '@/modules/planning/planning.module';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { QuoteTemplatesModule } from '@/modules/quote-templates/quote-templates.module';
import { EmailTemplatesModule } from '@/modules/email-templates/email-templates.module';

@Module({
  imports: [ConfigModule, NotificationsModule, PlanningModule, CustomFieldsModule, ProjectsModule, QuoteTemplatesModule, EmailTemplatesModule],
  controllers: [QuotesController, PublicQuotesController],
  providers: [
    QuotesService,
    QuoteApprovalsService,
    QuoteQuestionsService,
    QuoteAttachmentsService,
    QuotePdfService,
    QuotePublicService,
    QuoteSchedulerService,
    PdfService,
  ],
  exports: [QuotesService],
})
export class QuotesModule {}
