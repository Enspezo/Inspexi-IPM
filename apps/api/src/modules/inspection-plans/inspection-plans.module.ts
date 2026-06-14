import { Module } from '@nestjs/common';
import { LookupModule } from '../lookups/lookup.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InspectionPlansController } from './inspection-plans.controller';
import { InspectionPlansService } from './inspection-plans.service';

@Module({
  imports: [LookupModule, NotificationsModule],
  controllers: [InspectionPlansController],
  providers: [InspectionPlansService],
  exports: [InspectionPlansService],
})
export class InspectionPlansModule {}
