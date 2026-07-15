import { Module } from '@nestjs/common';
import { ContactsModule } from '@/modules/contacts/contacts.module';
import { RequestsModule } from '@/modules/requests/requests.module';
import { TasksModule } from '@/modules/tasks/tasks.module';
import { NotesModule } from '@/modules/notes/notes.module';
import { KvkModule } from '@/modules/kvk/kvk.module';
import { GeocodingModule } from '@/modules/geocoding/geocoding.module';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { AiActionService } from './ai-action.service';
import { AiRunnerService } from './ai-runner.service';
import { AiUsageService } from './ai-usage.service';
import { AiAnthropicProvider } from './ai-anthropic.provider';
import { AiAgentAccessGuard } from './ai-agent-access.guard';
import { AiToolRegistry } from './tools/tool-registry';

/**
 * AI-assistent (add-on, PRD-12) — fase 2 (agent-kern, lezen). Importeert de
 * feature-modules waarvan de lees-tools de services hergebruiken, zodat de agent
 * exact de rechten van de gebruiker erft (geen gedupliceerde business-logica).
 */
@Module({
  imports: [
    ContactsModule,
    RequestsModule,
    TasksModule,
    NotesModule,
    KvkModule,
    GeocodingModule,
  ],
  controllers: [AiAgentController],
  providers: [
    AiAgentService,
    AiActionService,
    AiRunnerService,
    AiUsageService,
    AiToolRegistry,
    AiAnthropicProvider,
    AiAgentAccessGuard,
  ],
})
export class AiAgentModule {}
