import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { FindingsModule } from '../findings/findings.module';
import { StandaloneMeasurementsModule } from '../standalone-measurements/standalone-measurements.module';
import { LocationImagesController } from './location-images.controller';
import { LocationImagesService } from './location-images.service';

// StorageModule is @Global → niet importeren; STORAGE_PROVIDER wordt geïnjecteerd.
@Module({
  imports: [AssetsModule, FindingsModule, StandaloneMeasurementsModule],
  controllers: [LocationImagesController],
  providers: [LocationImagesService],
  exports: [LocationImagesService],
})
export class LocationImagesModule {}
