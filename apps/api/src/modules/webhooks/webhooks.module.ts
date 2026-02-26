import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [ConfigModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
