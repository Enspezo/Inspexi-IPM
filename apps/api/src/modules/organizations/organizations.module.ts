import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { SupportAccessService } from './support-access.service';
import { SupportAccessScheduler } from './support-access.scheduler';
import { StorageModule } from '@/common/services/storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, SupportAccessService, SupportAccessScheduler],
  exports: [OrganizationsService, SupportAccessService],
})
export class OrganizationsModule {}
