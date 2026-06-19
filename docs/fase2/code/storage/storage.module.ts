// Vervangt apps/api/src/common/services/storage/storage.module.ts
//
// Env-schakelbare storage-driver: STORAGE_DRIVER=local (default) | r2.
// Lokaal blijft LocalStorageProvider (UPLOAD_DIR); productie kan R2.
// De interface (STORAGE_PROVIDER) blijft ongewijzigd, dus bestaande modules
// (documents, quotes) blijven werken; nieuwe inspectie-modules die signed URLs
// nodig hebben feature-detecten via `supportsSignedUrls()`.

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.interface';
import { LocalStorageProvider } from './local-storage.provider';
import { R2StorageProvider } from './r2-storage.provider';

@Global()
@Module({
  providers: [
    LocalStorageProvider,
    R2StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider, R2StorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalStorageProvider,
        r2: R2StorageProvider,
      ) => (config.get<string>('STORAGE_DRIVER', 'local') === 'r2' ? r2 : local),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
