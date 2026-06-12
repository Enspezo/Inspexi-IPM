import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlanningController } from './planning.controller';
import { PlanningPublicController, PlanningIcalController } from './planning-public.controller';
import { PlanningService } from './planning.service';
import { PlanningSessionsService } from './planning-sessions.service';
import { PlanningFollowersService } from './planning-followers.service';
import { PlanningPublicService } from './planning-public.service';
import { PlanningEmailService } from './planning-email.service';
import { PlanningIcalService } from './planning-ical.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { StorageModule } from '@/common/services/storage/storage.module';
import { WorkOrdersModule } from '@/modules/work-orders/work-orders.module';

@Module({
  imports: [ConfigModule, NotificationsModule, StorageModule, WorkOrdersModule],
  controllers: [PlanningController, PlanningPublicController, PlanningIcalController],
  providers: [
    PlanningService,
    PlanningSessionsService,
    PlanningFollowersService,
    PlanningPublicService,
    PlanningEmailService,
    PlanningIcalService,
  ],
  exports: [PlanningService],
})
export class PlanningModule {}
