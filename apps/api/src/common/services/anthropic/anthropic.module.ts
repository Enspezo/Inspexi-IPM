import { Global, Module } from '@nestjs/common';
import { AnthropicClientService } from './anthropic-client.service';

/**
 * @Global (zoals TenantCacheModule/StorageModule) zodat voice, ai-review en de
 * latere help-chatbot dezelfde Anthropic-client injecteren zonder per module te
 * importeren. ConfigModule is globaal (ANTHROPIC_API_KEY).
 */
@Global()
@Module({
  providers: [AnthropicClientService],
  exports: [AnthropicClientService],
})
export class AnthropicModule {}
