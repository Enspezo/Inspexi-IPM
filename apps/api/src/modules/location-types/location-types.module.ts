import { Module } from '@nestjs/common';
import { LocationTypesController } from './location-types.controller';
import { LocationTypesService } from './location-types.service';

@Module({
  controllers: [LocationTypesController],
  providers: [LocationTypesService],
  exports: [LocationTypesService],
})
export class LocationTypesModule {}
