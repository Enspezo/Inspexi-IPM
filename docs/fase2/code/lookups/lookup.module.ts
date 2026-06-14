// Doel in apps/api: src/modules/lookups/lookup.module.ts
// Registreer in app.module.ts imports. LookupService wordt geëxporteerd zodat
// andere inspectie-modules hem injecteren voor *Code-resolutie/validatie.

import { Module } from '@nestjs/common';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';

@Module({
  controllers: [LookupController],
  providers: [LookupService],
  exports: [LookupService],
})
export class LookupModule {}
