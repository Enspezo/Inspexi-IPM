import { Module } from '@nestjs/common';
import { ClientInspectionsModule } from '../client-inspections/client-inspections.module';
import { ClientFindingsController } from './client-findings.controller';
import { ClientFindingsService } from './client-findings.service';

@Module({
  imports: [ClientInspectionsModule],
  controllers: [ClientFindingsController],
  providers: [ClientFindingsService],
})
export class ClientFindingsModule {}
