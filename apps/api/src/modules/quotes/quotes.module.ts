import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuotesController, PublicQuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [ConfigModule],
  controllers: [QuotesController, PublicQuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
