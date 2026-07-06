import { Module } from '@nestjs/common';
import { NotesModule } from '../notes/notes.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatThreadsService } from './chat-threads.service';
import { ChatSyncService } from './chat-sync.service';
import { ChatTranscriptsService } from './chat-transcripts.service';

// NotificationsModule is @Global → NotificationsService is overal injecteerbaar.
@Module({
  imports: [NotesModule],
  controllers: [ChatController],
  providers: [ChatService, ChatThreadsService, ChatSyncService, ChatTranscriptsService],
  exports: [ChatService, ChatThreadsService, ChatSyncService, ChatTranscriptsService],
})
export class ChatModule {}
