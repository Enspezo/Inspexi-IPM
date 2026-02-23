import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationPrefsController } from './notification-prefs.controller';

@Global()
@Module({
  controllers: [NotificationsController, NotificationPrefsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
