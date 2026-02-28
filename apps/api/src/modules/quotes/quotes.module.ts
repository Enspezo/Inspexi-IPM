import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuotesController, PublicQuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuoteSchedulerService } from './quote-scheduler.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PlanningModule } from '@/modules/planning/planning.module';

@Module({
  imports: [ConfigModule, NotificationsModule, PlanningModule],
  controllers: [QuotesController, PublicQuotesController],
  providers: [QuotesService, QuoteSchedulerService],
  exports: [QuotesService],
})
export class QuotesModule {}
