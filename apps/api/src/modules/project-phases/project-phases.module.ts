import { Module } from '@nestjs/common';
import { ProjectPhasesController } from './project-phases.controller';
import { ProjectPhasesService } from './project-phases.service';
import { ProjectPhasesScheduler } from './project-phases.scheduler';

@Module({
  controllers: [ProjectPhasesController],
  providers: [ProjectPhasesService, ProjectPhasesScheduler],
  exports: [ProjectPhasesService],
})
export class ProjectPhasesModule {}
