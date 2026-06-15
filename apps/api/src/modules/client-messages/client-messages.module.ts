import { Module } from '@nestjs/common';
import { ClientInspectionsModule } from '../client-inspections/client-inspections.module';
import { ClientMessagesController } from './client-messages.controller';
import { ClientMessagesService } from './client-messages.service';

@Module({
  imports: [ClientInspectionsModule],
  controllers: [ClientMessagesController],
  providers: [ClientMessagesService],
})
export class ClientMessagesModule {}
