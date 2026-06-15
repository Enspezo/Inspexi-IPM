import { Module } from '@nestjs/common';
import { ClientInspectionsModule } from '../client-inspections/client-inspections.module';
import { ClientDocumentsController } from './client-documents.controller';
import { ClientDocumentsService } from './client-documents.service';

@Module({
  imports: [ClientInspectionsModule],
  controllers: [ClientDocumentsController],
  providers: [ClientDocumentsService],
})
export class ClientDocumentsModule {}
