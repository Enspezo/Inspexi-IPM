import { Module } from '@nestjs/common';
import { NotesModule } from '../notes/notes.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

// NotificationsModule is @Global → NotificationsService is overal injecteerbaar.
@Module({
  imports: [NotesModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
