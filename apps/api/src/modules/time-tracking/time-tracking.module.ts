// Urenregistratie & locatietracking inspecteurs (add-on, PRD-16, fase 1).
// Geregistreerd in app.module.ts. EntitlementsModule is @Global (feature-gate);
// taken worden rechtstreeks via Prisma aangemaakt (geen import van TasksModule
// — de toewijs-taak is een systeemtaak, niet een gebruikersactie op /tasks).

import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeTrackingController } from './time-tracking.controller';
import { TimeEntriesService } from './time-entries.service';
import { TimesheetsService } from './timesheets.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TimeTrackingController],
  providers: [TimeEntriesService, TimesheetsService],
  exports: [TimeEntriesService, TimesheetsService],
})
export class TimeTrackingModule {}
