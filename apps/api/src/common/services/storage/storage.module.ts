import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.interface';
import { LocalStorageProvider } from './local-storage.provider';
import { R2StorageProvider } from './r2-storage.provider';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      // Instantiate ONLY the selected provider. R2StorageProvider's constructor
      // getOrThrow's the R2_* keys, so listing it as an eager provider would crash
      // boot on a `local` deployment that omits those keys (DEP-2).
      useFactory: (config: ConfigService) =>
        config.get<string>('STORAGE_DRIVER', 'local') === 'r2'
          ? new R2StorageProvider(config)
          : new LocalStorageProvider(config),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
