import { Module } from '@nestjs/common';
import { AvailabilityTemplatesController } from './availability-templates.controller';
import { AvailabilityTemplatesService } from './availability-templates.service';
import { UserSchedulesController } from './user-schedules.controller';
import { UserSchedulesService } from './user-schedules.service';
import { AvailabilityExceptionsController } from './availability-exceptions.controller';
import { AvailabilityExceptionsService } from './availability-exceptions.service';
import { AvailabilityResolutionController } from './availability-resolution.controller';
import { AvailabilityResolutionService } from './availability-resolution.service';
import { AvailabilityNotifier } from './availability-notifier.service';

@Module({
  controllers: [
    AvailabilityTemplatesController,
    UserSchedulesController,
    AvailabilityExceptionsController,
    AvailabilityResolutionController,
  ],
  providers: [
    AvailabilityTemplatesService,
    UserSchedulesService,
    AvailabilityExceptionsService,
    AvailabilityResolutionService,
    AvailabilityNotifier,
  ],
  exports: [
    AvailabilityTemplatesService,
    UserSchedulesService,
    AvailabilityExceptionsService,
    AvailabilityResolutionService,
  ],
})
export class AvailabilityModule {}
