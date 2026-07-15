import { Module } from '@nestjs/common';
import { AvailabilityTemplatesController } from './availability-templates.controller';
import { AvailabilityTemplatesService } from './availability-templates.service';
import { UserSchedulesController } from './user-schedules.controller';
import { UserSchedulesService } from './user-schedules.service';

@Module({
  controllers: [AvailabilityTemplatesController, UserSchedulesController],
  providers: [AvailabilityTemplatesService, UserSchedulesService],
  exports: [AvailabilityTemplatesService, UserSchedulesService],
})
export class AvailabilityModule {}
