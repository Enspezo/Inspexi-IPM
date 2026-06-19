import { Module } from '@nestjs/common';
import { ClassificationModelsController } from './classification-models.controller';
import { ClassificationModelsService } from './classification-models.service';

@Module({
  controllers: [ClassificationModelsController],
  providers: [ClassificationModelsService],
  exports: [ClassificationModelsService],
})
export class ClassificationModelsModule {}
