import { Module } from '@nestjs/common';
import { DocumentGenerationModule } from '../document-generation/document-generation.module';
import { LookupModule } from '../lookups/lookup.module';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import {
  GeneratedDocumentsController,
  SignatureRequestsController,
} from './generated-documents.controller';
import { GeneratedDocumentsService } from './generated-documents.service';

// EmailService, ConfigService, PrismaService en STORAGE_PROVIDER zijn globaal beschikbaar.
@Module({
  imports: [DocumentGenerationModule, LookupModule, AssetNodesModule],
  controllers: [GeneratedDocumentsController, SignatureRequestsController],
  providers: [GeneratedDocumentsService],
  exports: [GeneratedDocumentsService],
})
export class GeneratedDocumentsModule {}
