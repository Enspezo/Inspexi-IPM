import { Module } from '@nestjs/common';
import { ClientInspectionsModule } from '../client-inspections/client-inspections.module';
import { ClientRequestsController } from './client-requests.controller';
import { ClientRequestsService } from './client-requests.service';

@Module({
  imports: [ClientInspectionsModule],
  controllers: [ClientRequestsController],
  providers: [ClientRequestsService],
})
export class ClientRequestsModule {}
