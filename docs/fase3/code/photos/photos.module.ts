// Doel in apps/api: src/modules/photos/photos.module.ts
// StorageModule is @Global → STORAGE_PROVIDER wordt geïnjecteerd, niet geïmporteerd.
import { Module } from '@nestjs/common';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

@Module({
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
