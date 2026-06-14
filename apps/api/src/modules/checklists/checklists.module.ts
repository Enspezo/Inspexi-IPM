import { Module } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';
import { ChecklistItemsController } from './checklist-items.controller';
import { ChecklistsService } from './checklists.service';
import { ChecklistItemsService } from './checklist-items.service';

@Module({
  controllers: [ChecklistsController, ChecklistItemsController],
  providers: [ChecklistsService, ChecklistItemsService],
  exports: [ChecklistsService, ChecklistItemsService],
})
export class ChecklistsModule {}
