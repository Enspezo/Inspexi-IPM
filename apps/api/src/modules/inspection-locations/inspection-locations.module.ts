import { Module } from '@nestjs/common';
import { LocationTypesModule } from '../location-types/location-types.module';
import { InspectionLocationsController } from './inspection-locations.controller';
import { InspectionLocationsService } from './inspection-locations.service';

@Module({
  imports: [LocationTypesModule],
  controllers: [InspectionLocationsController],
  providers: [InspectionLocationsService],
  exports: [InspectionLocationsService],
})
export class InspectionLocationsModule {}
