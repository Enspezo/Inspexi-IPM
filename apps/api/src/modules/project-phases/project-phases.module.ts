import { Module } from '@nestjs/common';
import { ProjectPhasesController } from './project-phases.controller';
import { ProjectPhasesService } from './project-phases.service';

@Module({
  controllers: [ProjectPhasesController],
  providers: [ProjectPhasesService],
  exports: [ProjectPhasesService],
})
export class ProjectPhasesModule {}
