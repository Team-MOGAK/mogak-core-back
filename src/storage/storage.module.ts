import { Module } from '@nestjs/common';

import { STORAGE_PORT } from './application/storage.port';
import { DisabledStorageAdapter } from './infrastructure/disabledStorage.adapter';

@Module({
  providers: [
    DisabledStorageAdapter,
    {
      provide: STORAGE_PORT,
      useExisting: DisabledStorageAdapter,
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
