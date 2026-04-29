import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { QuotesModule } from '../quotes/quotes.module';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';

@Module({
  imports: [QuotesModule, CustomFieldsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
