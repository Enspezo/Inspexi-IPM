import { Module } from '@nestjs/common';
import { LookupModule } from '../lookups/lookup.module';
import { ClientLookupsController } from './client-lookups.controller';

// Hergebruikt LookupService (LookupModule exporteert 'm) voor de read-only client-lookups.
@Module({
  imports: [LookupModule],
  controllers: [ClientLookupsController],
})
export class ClientLookupsModule {}
