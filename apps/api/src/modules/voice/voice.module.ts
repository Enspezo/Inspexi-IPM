// Voice-module (Fase 7): parse-measurement + 3-lagen prompt-beheer.
// Geregistreerd in app.module.ts. ConfigModule is globaal (ANTHROPIC_API_KEY/MODEL).

import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoicePromptsController } from './voice-prompts.controller';
import { VoicePromptAdminController } from './voice-prompt-admin.controller';
import { VoiceParseService } from './voice-parse.service';
import { VoicePromptService } from './voice-prompt.service';

@Module({
  controllers: [VoiceController, VoicePromptsController, VoicePromptAdminController],
  providers: [VoiceParseService, VoicePromptService],
  exports: [VoiceParseService, VoicePromptService],
})
export class VoiceModule {}
